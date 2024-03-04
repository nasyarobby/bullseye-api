import fastify, { FastifyReply, FastifyRequest } from "fastify";
import connectionsRoute from "./routes/connections.route";
import queuesRoute from "./routes/queues.route";
const app = fastify({
  logger: {
    level: "trace",
  },
});

app.register(connectionsRoute)
app.register(queuesRoute)

app.listen(
  {
    host: "0.0.0.0",
    port: 3000,
  },
  (err, address) => {
    if (err) {
      app.log.fatal({ err }, "Cannot start server");
      throw new Error("Cannot start server");
    }
  }
);
