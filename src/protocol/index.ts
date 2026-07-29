export type {
  SignedTreeHead,
  UnwitnessedRecord,
  WitnessedRecord,
  WitnessRecord,
  LatestSTHResponse,
  WitnessPostRequest,
  WitnessPostResponse,
  MultibaseVerificationMethod,
  JwkVerificationMethod,
  VerificationMethod,
  IdentityDocument,
  WitnessConfig,
} from './types.js';

export {
  isSignedTreeHead,
  parseSignedTreeHead,
  isUnwitnessedRecord,
  isWitnessedRecord,
  parseLatestSTHResponse,
  isMultibaseVerificationMethod,
  isJwkVerificationMethod,
  isVerificationMethod,
  isIdentityDocument,
  parseIdentityDocument,
  isWitnessPostResponse,
  parseWitnessPostResponse,
} from './validate.js';
