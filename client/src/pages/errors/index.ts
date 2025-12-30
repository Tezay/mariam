/**
 * Error Pages - Barrel Export
 * 
 * Only exports pages used in routing:
 * - NotFound: 404 catch-all route
 * - Forbidden: AdminRoute access denied
 * 
 * For inline error display (API failures, network errors),
 * use InlineError component from @/components/InlineError instead.
 */
export { NotFound } from './NotFound';
export { Forbidden } from './Forbidden';
