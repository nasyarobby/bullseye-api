function mapObject<T>(obj: { [k: string]: T }, fn: (o: any, k: string, obj: object) => any) {
    const keys = Object.keys(obj);

    const ret: { [k: string]: T } = {}

    keys.forEach(k => {
        ret[k] = fn(obj[k], k, obj)
    })

    return ret;
}

export default mapObject;