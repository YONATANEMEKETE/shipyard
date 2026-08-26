import type { auth } from './auth.js';

type SessionData = (typeof auth)['$Infer']['Session'];
type SessionRow = SessionData['session'];
type UserRow = SessionData['user'];

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by requireSession when a valid session cookie is present. */
    session?: SessionRow;
    /** The authenticated user, set alongside session by requireSession. */
    user?: UserRow;
  }
}
