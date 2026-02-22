import { router } from '../../trpc';
import { huntRouter } from './hunt/router';
import { auditRouter } from './audit/router';
import { queryRouter } from './query/router';
import { importExportRouter } from './import-export/router';
import { favoriteRouter } from './favorite/router';

export const leadRouter = router({
  hunt: huntRouter,
  audit: auditRouter,
  query: queryRouter,
  importExport: importExportRouter,
  favorite: favoriteRouter,
});

export default leadRouter;
