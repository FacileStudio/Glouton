import { inflateRawSync } from 'node:zlib';
import type { JobCv, Prisma, PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import type { Scope } from '../../utils/scope';

/** The largest CV file Glouton keeps. */
export const MAX_CV_BYTES = 4 * 1024 * 1024;
/** The most CVs one person keeps in one space. */
export const MAX_CVS = 10;
/** The longest CV text, typed or read from a file. */
export const MAX_CV_TEXT = 30_000;

export const PDF = 'application/pdf';
export const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const CV_TYPES = [PDF, DOCX] as const;
export type CvType = (typeof CV_TYPES)[number];

const MAX_XML_BYTES = 20 * 1024 * 1024;

const notFound = () => new TRPCError({ code: 'NOT_FOUND', message: 'CV not found' });

/** The file type its first bytes prove, or null: a PDF starts with %PDF-, a DOCX is a zip holding word/document.xml. */
export function sniffType(bytes: Uint8Array): CvType | null {
  if (bytes.length > 5 && Buffer.from(bytes.subarray(0, 5)).toString('latin1') === '%PDF-') return PDF;
  if (bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04 && zipEntry(bytes, 'word/document.xml')) return DOCX;
  return null;
}

/** One stored file of a zip archive, read through its central directory, or null. */
export function zipEntry(bytes: Uint8Array, name: string): Buffer | null {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let at = buf.length - 22; at >= Math.max(0, buf.length - 22 - 0xffff); at--) {
    if (buf.readUInt32LE(at) === 0x06054b50) {
      end = at;
      break;
    }
  }
  if (end < 0) return null;
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  for (let index = 0; index < count && at + 46 <= buf.length; index++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 20);
    const nameLength = buf.readUInt16LE(at + 28);
    const extra = buf.readUInt16LE(at + 30);
    const comment = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const entry = buf.toString('utf8', at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extra + comment;
    if (entry !== name) continue;
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) return null;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    if (method === 0) return Buffer.from(data);
    if (method !== 8) return null;
    try {
      return inflateRawSync(data, { maxOutputLength: MAX_XML_BYTES });
    } catch {
      return null;
    }
  }
  return null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** The text of a DOCX: one line per paragraph, tabs kept, markup dropped. Empty when the file cannot be read. */
export function docxText(bytes: Uint8Array): string {
  const xml = zipEntry(bytes, 'word/document.xml')?.toString('utf8');
  if (!xml) return '';
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>|<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
      if (code.startsWith('#x')) return String.fromCodePoint(parseInt(code.slice(2), 16));
      if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(1), 10));
      return ENTITIES[code.toLowerCase()] ?? match;
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_CV_TEXT);
}

/**
 * Who may read a CV: its owner, and, only once the owner shared it, the
 * other members of its team while the owner is still one of them. Nobody
 * else learns it exists.
 */
export function readableWhere(userId: string, scope: Scope): Prisma.JobCvWhereInput {
  if (scope.type === 'personal') return { userId, teamId: null };
  return {
    teamId: scope.teamId,
    OR: [{ userId }, { shared: true, user: { teamMembers: { some: { teamId: scope.teamId } } } }],
  };
}

const LISTED = { id: true, userId: true, teamId: true, name: true, fileName: true, mimeType: true, size: true, shared: true, createdAt: true, updatedAt: true } as const;

type Listed = Pick<JobCv, keyof typeof LISTED>;

/** A CV as lists show it: no file, no text, and whether the caller owns it. */
function presentListed(row: Listed & { text?: string | null; user?: { firstName: string; lastName: string } }, userId: string) {
  return {
    id: row.id,
    name: row.name,
    fileName: row.fileName,
    mimeType: row.mimeType,
    size: row.size,
    shared: row.shared,
    mine: row.userId === userId,
    owner: row.user ? `${row.user.firstName} ${row.user.lastName}`.trim() : null,
    hasText: Boolean(row.text?.trim()),
    hasFile: Boolean(row.size),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listCvs(prisma: PrismaClient, userId: string, scope: Scope) {
  const rows = await prisma.jobCv.findMany({
    where: readableWhere(userId, scope),
    orderBy: { updatedAt: 'desc' },
    select: { ...LISTED, text: true, user: { select: { firstName: true, lastName: true } } },
  });
  return rows.map((row) => presentListed(row, userId));
}

async function readable(prisma: PrismaClient, userId: string, scope: Scope, cvId: string) {
  const row = await prisma.jobCv.findFirst({ where: { id: cvId, ...readableWhere(userId, scope) } });
  if (!row) throw notFound();
  return row;
}

async function owned(prisma: PrismaClient, userId: string, scope: Scope, cvId: string) {
  const row = await readable(prisma, userId, scope, cvId);
  if (row.userId !== userId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the owner can change this CV' });
  return row;
}

/** One CV with its text, for its owner or a teammate it was shared with. */
export async function getCv(prisma: PrismaClient, userId: string, scope: Scope, cvId: string) {
  const row = await readable(prisma, userId, scope, cvId);
  return { ...presentListed(row, userId), text: row.text ?? '' };
}

/** The stored file, base64, under the same rule as reading the CV. */
export async function downloadCv(prisma: PrismaClient, userId: string, scope: Scope, cvId: string) {
  const row = await readable(prisma, userId, scope, cvId);
  if (!row.file) throw new TRPCError({ code: 'NOT_FOUND', message: 'This CV has no file' });
  return { fileName: row.fileName ?? 'cv', mimeType: row.mimeType ?? PDF, data: Buffer.from(row.file).toString('base64') };
}

/** What adding a CV takes: a name, and a file (base64), a text, or both. */
export interface NewCv {
  name: string;
  fileName?: string;
  data?: string;
  text?: string;
}

function decode(data: string): { bytes: Buffer; type: CvType } {
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_CV_BYTES) throw new TRPCError({ code: 'BAD_REQUEST', message: 'cv_too_large' });
  const type = sniffType(bytes);
  if (!type) throw new TRPCError({ code: 'BAD_REQUEST', message: 'cv_type' });
  return { bytes, type };
}

/**
 * Stores a CV for its owner in the scope, private. A DOCX gives its text
 * when none was typed; a PDF keeps the typed text only.
 */
export async function createCv(prisma: PrismaClient, userId: string, scope: Scope, input: NewCv) {
  const teamId = scope.type === 'team' ? scope.teamId : null;
  if ((await prisma.jobCv.count({ where: { userId, teamId } })) >= MAX_CVS) throw new TRPCError({ code: 'BAD_REQUEST', message: 'cv_count' });
  const file = input.data ? decode(input.data) : null;
  const typed = input.text?.trim() ?? '';
  const text = typed || (file?.type === DOCX ? docxText(file.bytes) : '');
  if (!file && !text) throw new TRPCError({ code: 'BAD_REQUEST', message: 'cv_empty' });
  const row = await prisma.jobCv.create({
    data: {
      userId,
      teamId,
      name: input.name.trim(),
      fileName: file ? (input.fileName?.trim() || 'cv').slice(0, 200) : null,
      mimeType: file?.type ?? null,
      size: file?.bytes.length ?? null,
      file: file ? new Uint8Array(file.bytes) : null,
      text: text.slice(0, MAX_CV_TEXT) || null,
    },
  });
  return { ...presentListed(row, userId), text: row.text ?? '' };
}

/** Renames a CV, edits its text, or shares it with its team. Owner only; a personal CV cannot be shared. */
export async function updateCv(prisma: PrismaClient, userId: string, scope: Scope, cvId: string, fields: { name?: string; text?: string; shared?: boolean }) {
  const row = await owned(prisma, userId, scope, cvId);
  if (fields.shared && !row.teamId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'A personal CV has no team to share with' });
  const updated = await prisma.jobCv.update({
    where: { id: row.id },
    data: {
      ...(fields.name !== undefined ? { name: fields.name.trim() } : {}),
      ...(fields.text !== undefined ? { text: fields.text.trim().slice(0, MAX_CV_TEXT) || null } : {}),
      ...(fields.shared !== undefined ? { shared: fields.shared } : {}),
    },
  });
  return { ...presentListed(updated, userId), text: updated.text ?? '' };
}

/** Deletes a CV and its file for good. Owner only. Drafts made from it stay, unlinked. */
export async function deleteCv(prisma: PrismaClient, userId: string, scope: Scope, cvId: string) {
  const row = await owned(prisma, userId, scope, cvId);
  await prisma.jobCv.delete({ where: { id: row.id } });
  return { cvId: row.id };
}

/** The CV text Bulle tailors: the chosen CV, or the caller's newest CV with text. Only the caller's own CVs. */
export async function cvTextFor(prisma: PrismaClient, userId: string, scope: Scope, cvId?: string): Promise<{ id: string; text: string }> {
  const teamId = scope.type === 'team' ? scope.teamId : null;
  const row = cvId
    ? await prisma.jobCv.findFirst({ where: { id: cvId, userId, teamId }, select: { id: true, text: true } })
    : await prisma.jobCv.findFirst({ where: { userId, teamId, text: { not: null } }, orderBy: { updatedAt: 'desc' }, select: { id: true, text: true } });
  if (cvId && !row) throw notFound();
  if (!row?.text?.trim()) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'cv_text_missing' });
  return { id: row.id, text: row.text };
}
