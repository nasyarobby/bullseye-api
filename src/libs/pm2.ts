import { Redis, RedisOptions } from "ioredis";

function parseMessage(msg: string[]) {
    const ret: { [key: string]: string } = {};
    msg.forEach((e, i, arr) => {
        if (i % 2 === 0) {
            ret[e] = arr[i + 1]
        }
    })
    return ret;
}

function parseRedisSentinel(str: string) {
    return str
        .split(',')
        .map((sentinelString) => sentinelString.trim())
        .map((sentinelString) => sentinelString.split(':'))
        .map(([host, port]) => ({ host, port: Number(port) || 26379 }));
}

function getRedisConfig(): { config: RedisOptions, isUsingSentinels: boolean } {
    const sentinels = process.env.PM2_REDIS_SENTINELS;
    const DB = process.env.PM2_REDIS_DB ? Number(process.env.PM2_REDIS_DB) : 0
    const PORT = process.env.PM2_REDIS_DB ? Number(process.env.PM2_REDIS_PORT) : 6379
    const HOST = process.env.PM2_REDIS_HOST
    const PASS = process.env.PM2_REDIS_PASS
    const SENTINELS_MASTER = process.env.PM2_REDIS_SENTINELS_MASTER;

    if (sentinels) {
        return {
            isUsingSentinels: true, config: {
                sentinels: parseRedisSentinel(sentinels),
                password: PASS,
                db: DB,
                name: SENTINELS_MASTER,
                maxRetriesPerRequest: null,
                enableReadyCheck: false,
            }
        }
    }

    return {
        isUsingSentinels: false, config: {
            password: PASS,
            db: DB,
            host: HOST,
            port: PORT
        }
    }
}

class PM2Central {
    declare name: string;
    declare sub: Redis;
    declare pub: Redis;
    declare stream: string;
    declare onMessage: (msg: { [key: string]: string }) => void

    constructor(name: string, args: { 
        stream: string,
        onMessage: (msg: { [key: string]: string }) => void
     }) {
        this.name = name;
        const config = getRedisConfig();
        this.sub = new Redis(config.config);
        this.pub = new Redis(config.config);
        this.stream = args.stream;
        this.onMessage = args.onMessage;
        return this;
    }


    async sendCommand(obj: { [key: string]: string }) {
        return new Promise(res => {
            this.pub.publish(this.stream, JSON.stringify({...obj, from: this.name}))
                .catch(err => {
                    console.error(err);
                })
        })
    }

    async listen(): Promise<void> {
        const channel = this.stream+':'+this.name;
        console.log("Listening to %s", channel)
        this.sub.subscribe(channel);
        this.sub.on("message", (_channel, message) => {
            console.log("onMessage", _channel, message)
            if(channel === _channel) {
                this.onMessage(JSON.parse(message))
            }
        })
    }
}

export default PM2Central