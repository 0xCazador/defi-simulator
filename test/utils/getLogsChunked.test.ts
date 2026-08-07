import { getLogsChunked } from "../../pages/api/aave/accrual";

const FILTER = { address: "0xtoken", topics: ["0xtopic"] };

/**
 * Fake provider over synthetic logs (one per block number), which throws the
 * Alchemy-style cap error whenever a request would return more than `cap` logs.
 */
const makeProvider = (logBlocks: number[], cap: number) => {
    const calls: Array<{ fromBlock: number; toBlock: number }> = [];
    return {
        calls,
        getLogs: async ({ fromBlock, toBlock }: any) => {
            calls.push({ fromBlock, toBlock });
            const hits = logBlocks.filter((b) => b >= fromBlock && b <= toBlock);
            if (hits.length > cap) {
                throw new Error(
                    "processing response error (body=\"Log response size exceeded. You can make eth_getLogs requests with up to a 2K block range...\")"
                );
            }
            return hits.map((blockNumber) => ({ blockNumber })) as any;
        },
    };
};

describe("getLogsChunked", () => {
    it("returns results from a single call when under the cap", async () => {
        const provider = makeProvider([5, 10, 15], 10);
        const logs = await getLogsChunked(provider, FILTER, 0, 100);
        expect(logs.map((l) => l.blockNumber)).toEqual([5, 10, 15]);
        expect(provider.calls.length).toBe(1);
    });

    it("bisects the range on a cap error and returns the complete set", async () => {
        // 30 logs spread over blocks 0..2999 with a cap of 10 forces recursive splits
        const blocks = Array.from({ length: 30 }, (_, i) => i * 100);
        const provider = makeProvider(blocks, 10);
        const logs = await getLogsChunked(provider, FILTER, 0, 2999);
        expect(logs.map((l) => l.blockNumber)).toEqual(blocks);
        expect(provider.calls.length).toBeGreaterThan(1);
    });

    it("rethrows errors that are not the provider log cap", async () => {
        const provider = {
            getLogs: async () => {
                throw new Error("403 Forbidden: origin not on whitelist");
            },
        };
        await expect(getLogsChunked(provider, FILTER, 0, 100)).rejects.toThrow("whitelist");
    });

    it("gives up once the call budget is exhausted", async () => {
        // every block has a log and the cap is 1, so chunking can never succeed
        const blocks = Array.from({ length: 1000 }, (_, i) => i);
        const provider = makeProvider(blocks, 1);
        await expect(
            getLogsChunked(provider, FILTER, 0, 999, { calls: 20 })
        ).rejects.toThrow(/response size/i);
        expect(provider.calls.length).toBeLessThanOrEqual(21);
    });
});
