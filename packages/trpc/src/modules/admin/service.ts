import { SQL } from 'bun';
import { AdminEngine, PermissionService, AuditService } from '@repo/admin';
import type { EntityConfig } from '@repo/admin';

export class AdminService {
  private engines: Map<string, AdminEngine> = new Map();
  private permissionService: PermissionService;
  private auditService: AuditService;

  // Déclaration des configurations pour alléger le constructeur
  private readonly ENTITY_CONFIGS: EntityConfig[] = [
    {
      name: 'user', // Note: Pense à vérifier comment AdminEngine gère le nom de la table SQL (ex: "User")
      displayName: 'User',
      fields: [
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'firstName', label: 'First Name', type: 'string', required: true },
        { name: 'lastName', label: 'Last Name', type: 'string', required: true },
        {
          name: 'role',
          label: 'Role',
          type: 'select',
          required: true,
          options: [
            { value: 'USER', label: 'User' },
            { value: 'ADMIN', label: 'Admin' },
          ],
        },
        { name: 'isPremium', label: 'Premium', type: 'boolean' },
        { name: 'emailVerified', label: 'Email Verified', type: 'boolean' },
      ],
      listFields: ['email', 'firstName', 'lastName', 'role', 'createdAt'],
      searchFields: ['email', 'firstName', 'lastName'],
      defaultSort: { field: 'createdAt', order: 'desc' },
    },
    {
      name: 'contact',
      displayName: 'Contact',
      fields: [
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'firstName', label: 'First Name', type: 'string', required: true },
        { name: 'lastName', label: 'Last Name', type: 'string', required: true },
      ],
      listFields: ['email', 'firstName', 'lastName', 'createdAt'],
      searchFields: ['email', 'firstName', 'lastName'],
      defaultSort: { field: 'createdAt', order: 'desc' },
    },
    {
      name: 'media',
      displayName: 'Media',
      fields: [
        { name: 'url', label: 'URL', type: 'string', required: true },
        { name: 'key', label: 'Key', type: 'string', required: true },
        { name: 'mimeType', label: 'MIME Type', type: 'string', required: true },
        { name: 'size', label: 'Size (bytes)', type: 'number', required: true },
      ],
      listFields: ['url', 'mimeType', 'size', 'createdAt'],
      searchFields: ['key', 'mimeType'],
      defaultSort: { field: 'createdAt', order: 'desc' },
    },
  ];

  constructor(private db: SQL) {
    this.permissionService = new PermissionService(db);
    this.auditService = new AuditService(db);
    this.registerEntities();
  }

  private registerEntities() {
    for (const config of this.ENTITY_CONFIGS) {
      this.registerEntity(config);
    }
  }

  private registerEntity(config: EntityConfig) {
    const engine = new AdminEngine(this.db, config);
    this.engines.set(config.name, engine);
  }

  getEngine(entity: string): AdminEngine {
    const engine = this.engines.get(entity);
    if (!engine) {
      throw new Error(`Entity "${entity}" not registered`);
    }
    return engine;
  }

  getAvailableEntities(): string[] {
    return Array.from(this.engines.keys());
  }

  getEntityConfig(entity: string) {
    return this.getEngine(entity).getConfig();
  }

  async getAllAuditLogs(options: {
    entity?: string;
    userId?: string;
    action?: 'CREATE' | 'UPDATE' | 'DELETE';
    limit?: number;
    offset?: number;
  }) {
    return this.auditService.getAllLogs(options);
  }

  async setPermissions(
    userId: string,
    entity: string,
    permissions: {
      canCreate: boolean;
      canRead: boolean;
      canUpdate: boolean;
      canDelete: boolean;
    }
  ) {
    return this.permissionService.setEntityPermissions(userId, entity, permissions);
  }

  async getUserPermissions(userId: string) {
    return this.permissionService.getAllUserPermissions(userId);
  }
}
