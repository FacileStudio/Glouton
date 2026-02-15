import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

interface FileToProcess {
  path: string;
  language: 'typescript' | 'rust' | 'svelte';
}

/**
 * removeInlineComments
 */
function removeInlineComments(content: string, language: 'typescript' | 'rust' | 'svelte'): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let inMultiLineComment = false;
  let inDocComment = false;
  let inStringLiteral = false;
  let stringChar = '';

  /**
   * for
   */
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();

    /**
     * if
     */
    if (language === 'typescript' || language === 'svelte') {
      /**
       * if
       */
      if (trimmed.startsWith('/**') && trimmed.endsWith('*/') && !inMultiLineComment) {
        result.push(line);
        continue;
      }

      /**
       * if
       */
      if (trimmed.startsWith('/**') && !inMultiLineComment) {
        inDocComment = true;
        result.push(line);
        continue;
      }

      /**
       * if
       */
      if (inDocComment) {
        result.push(line);
        /**
         * if
         */
        if (trimmed.endsWith('*/')) {
          inDocComment = false;
        }
        continue;
      }

      /**
       * if
       */
      if (trimmed.startsWith('/*') && !trimmed.startsWith('/**') && !inMultiLineComment) {
        inMultiLineComment = true;
        continue;
      }

      /**
       * if
       */
      if (inMultiLineComment) {
        /**
         * if
         */
        if (trimmed.endsWith('*/')) {
          inMultiLineComment = false;
        }
        continue;
      }

      const singleLineCommentIndex = line.indexOf('//');
      /**
       * if
       */
      if (singleLineCommentIndex !== -1) {
        let inString = false;
        let escapeNext = false;
        /**
         * for
         */
        for (let j = 0; j < singleLineCommentIndex; j++) {
          const char = line[j];
          /**
           * if
           */
          if (escapeNext) {
            escapeNext = false;
            continue;
          }
          /**
           * if
           */
          if (char === '\\') {
            escapeNext = true;
            continue;
          }
          /**
           * if
           */
          if (char === '"' || char === "'" || char === '`') {
            inString = !inString;
          }
        }

        /**
         * if
         */
        if (!inString) {
          line = line.substring(0, singleLineCommentIndex).trimEnd();
        }
      }

      const inlineBlockCommentPattern = /\/\*(?!\*).*?\*\
      line = line.replace(inlineBlockCommentPattern, '');
    } else if (language === 'rust') {
      /**
       * if
       */
      if (trimmed.startsWith('///') || trimmed.startsWith('//!')) {
        result.push(line);
        continue;
      }

      /**
       * if
       */
      if (trimmed.startsWith('/*') && !inMultiLineComment) {
        inMultiLineComment = true;
        continue;
      }

      /**
       * if
       */
      if (inMultiLineComment) {
        /**
         * if
         */
        if (trimmed.endsWith('*/')) {
          inMultiLineComment = false;
        }
        continue;
      }

      const singleLineCommentIndex = line.indexOf('//');
      /**
       * if
       */
      if (singleLineCommentIndex !== -1 && !line.substring(0, singleLineCommentIndex).includes('///')) {
        let inString = false;
        let escapeNext = false;
        /**
         * for
         */
        for (let j = 0; j < singleLineCommentIndex; j++) {
          const char = line[j];
          /**
           * if
           */
          if (escapeNext) {
            escapeNext = false;
            continue;
          }
          /**
           * if
           */
          if (char === '\\') {
            escapeNext = true;
            continue;
          }
          /**
           * if
           */
          if (char === '"' || char === "'") {
            inString = !inString;
          }
        }

        /**
         * if
         */
        if (!inString) {
          line = line.substring(0, singleLineCommentIndex).trimEnd();
        }
      }

      const inlineBlockCommentPattern = /\/\*(?![\*!]).*?\*\
      line = line.replace(inlineBlockCommentPattern, '');
    }

    /**
     * if
     */
    if (line.trim() !== '' || trimmed === '') {
      result.push(line);
    }
  }

  return result.join('\n');
}

/**
 * addFunctionDocs
 */
function addFunctionDocs(content: string, language: 'typescript' | 'rust' | 'svelte', filepath: string): string {
  /**
   * if
   */
  if (language === 'svelte') {
    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    /**
     * if
     */
    if (scriptMatch) {
      const scriptContent = scriptMatch[1];
      const processedScript = addFunctionDocs(scriptContent, 'typescript', filepath);
      return content.replace(scriptMatch[1], processedScript);
    }
    return content;
  }

  const lines = content.split('\n');
  const result: string[] = [];

  /**
   * for
   */
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    /**
     * if
     */
    if (language === 'typescript') {
      const functionMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
      const arrowFunctionMatch = trimmed.match(/^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/);
      const methodMatch = trimmed.match(/^(?:public\s+|private\s+|protected\s+)?(?:async\s+)?(\w+)\s*\(/);

      /**
       * if
       */
      if ((functionMatch || arrowFunctionMatch || methodMatch) && i > 0) {
        const prevLine = lines[i - 1]?.trim();
        /**
         * if
         */
        if (!prevLine?.startsWith('/**') && !prevLine?.endsWith('*/')) {
          const functionName = functionMatch?.[1] || arrowFunctionMatch?.[1] || methodMatch?.[1];
          const indent = line.match(/^\s*/)?.[0] || '';
          result.push(`${indent}/**`);
          result.push(`${indent} * ${functionName}`);
          result.push(`${indent} */`);
        }
      }
    } else if (language === 'rust') {
      const functionMatch = trimmed.match(/^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/);

      /**
       * if
       */
      if (functionMatch && i > 0) {
        const prevLine = lines[i - 1]?.trim();
        /**
         * if
         */
        if (!prevLine?.startsWith('///')) {
          const functionName = functionMatch[1];
          const indent = line.match(/^\s*/)?.[0] || '';
          result.push(`${indent}/// ${functionName}`);
        }
      }
    }

    result.push(line);
  }

  return result.join('\n');
}

/**
 * processFile
 */
async function processFile(file: FileToProcess): Promise<void> {
  try {
    const content = fs.readFileSync(file.path, 'utf-8');

    let processed = removeInlineComments(content, file.language);
    processed = addFunctionDocs(processed, file.language, file.path);

    /**
     * if
     */
    if (processed !== content) {
      fs.writeFileSync(file.path, processed, 'utf-8');
      console.log(`Processed: ${file.path}`);
    }
  } catch (error) {
    console.error(`Error processing ${file.path}:`, error);
  }
}

/**
 * main
 */
async function main() {
  const files = execSync(
    "find . -type f \\( -name '*.ts' -o -name '*.tsx' -o -name '*.svelte' -o -name '*.rs' \\) " +
    "-not -path '*/node_modules/*' " +
    "-not -path '*/target/*' " +
    "-not -path '*/dist/*' " +
    "-not -path '*/.svelte-kit/*' " +
    "-not -path '*/build/*'",
    { encoding: 'utf-8' }
  )
    .split('\n')
    .filter(Boolean);

  const filesToProcess: FileToProcess[] = files.map(file => {
    const ext = path.extname(file);
    let language: 'typescript' | 'rust' | 'svelte';

    /**
     * if
     */
    if (ext === '.rs') {
      language = 'rust';
    } else if (ext === '.svelte') {
      language = 'svelte';
    } else {
      language = 'typescript';
    }

    return { path: file, language };
  });

  console.log(`Processing ${filesToProcess.length} files...`);

  /**
   * for
   */
  for (const file of filesToProcess) {
    await processFile(file);
  }

  console.log('Done!');
}

/**
 * main
 */
main();
