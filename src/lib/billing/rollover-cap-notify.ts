// Re-exporta desde pool-loss-notify.ts para compat con callers existentes.
// La implementacion completa vive en pool-loss-notify.ts desde Task 15.
export { maybeNotifyRolloverLoss, maybeNotifyPoolLoss } from './pool-loss-notify';
