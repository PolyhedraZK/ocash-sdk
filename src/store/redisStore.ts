import { KeyValueStore, type KeyValueStoreOptions } from './keyValueStore';

export type RedisStoreOptions = KeyValueStoreOptions;

/**
 * Redis-backed store with a default key prefix.
 */
export class RedisStore extends KeyValueStore {
  constructor(options: RedisStoreOptions) {
    super({ ...options, keyPrefix: options.keyPrefix ?? 'ocash:sdk:redis:store' });
  }
}
