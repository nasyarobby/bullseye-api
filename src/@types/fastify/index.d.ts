import Bull from 'bull';
import Redis from 'ioredis';
import { AppConfig } from '..';

declare module 'fastify' {
  export declare namespace fastifyObjectionjs {
    export interface FastifyObjectionObject {
      knex: Knex
      models: typeof models
    }
  }

  interface FastifyInstance {
    config: AppConfig
  }
}
