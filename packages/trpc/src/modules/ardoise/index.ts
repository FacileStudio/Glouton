export * from './client';
export * from './sync';
export * from './inbound';
export {
  parseRemoteClient,
  normalizeName,
  similarNames,
  companyDomainOf,
  createCompanyFromClient,
  linkCompanyToClient,
  type Placement,
} from './mapping';
