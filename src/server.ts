import fastify, { FastifyReply, FastifyRequest } from "fastify";
import connectionsRoute from "./routes/connections.route";
import queuesRoute from "./routes/queues.route";
import fastifyEnv from "@fastify/env"
import AppRedis from "./libs/getRedis";
import fastifyWebsocket from "@fastify/websocket"
import pm2Route from "./routes/pm2.route";

const app = fastify({
  logger: {
    level: "trace",
  },
});

app.register(fastifyWebsocket);

const schema = {
  type: 'object',
  required: [],
  properties: {
    PORT: {
      type: 'number',
      default: 3000
    },
    REDIS_HOST: {
      type: 'string',
      default: 'localhost'
    },
    REDIS_PORT: {
      type: 'number',
      default: 6379
    },
    REDIS_DB: {
      type: 'number',
      default: 1
    },
    REDIS_pass: {
      type: 'string',
      default: ''
    }
  }
}

const options = {
  confKey: 'config', // optional, default: 'config'
  schema: schema,
};

(async () => {
  await app.register(fastifyEnv, options)

  console.table(app.config)

  new AppRedis({
    host: app.config.REDIS_HOST,
    password: app.config.REDIS_PASS,
    db: app.config.REDIS_DB,
    port: app.config.REDIS_PORT,
  })

  await app.register(connectionsRoute)
  await app.register(queuesRoute)
  await app.register(pm2Route)
  app.ready().then(() =>
    app.listen(
      {
        host: "0.0.0.0",
        port: app.config.PORT,
      },
      (err, address) => {
        if (err) {
          app.log.fatal({ err }, "Cannot start server");
          throw new Error("Cannot start server");
        }
      })
    );
})()


