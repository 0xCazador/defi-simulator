import type { NextApiRequest, NextApiResponse } from "next";

import {
  AaveMarketDataType,
  HealthFactorData,
  markets,
} from "../../../../hooks/useAaveData";
import { parseRequestBody } from "../../_utils/parseRequestBody";
import { getAaveData } from "..";

const allowedMethods = ["POST", "OPTIONS"];

const handler = async (_req: NextApiRequest, res: NextApiResponse) => {
  const timer = (ms: number | undefined) =>
    new Promise((res) => setTimeout(res, ms));

  try {
    if (!allowedMethods.includes(_req.method!)) {
      return res.status(405).send({ message: "Method not allowed." });
    }
    const isAbbreviated = !!_req.query.abbreviated;
    const { addresses, marketId, blockNumber } = parseRequestBody<{
      addresses?: string[];
      marketId?: string;
      blockNumber?: number;
    }>(_req.body);

    if (!Array.isArray(addresses) || addresses.length === 0 || !marketId) {
      return res.status(400).json({
        statusCode: 400,
        message: "Addresses and marketId are required",
      });
    }

    // Validate block number if provided
    if (blockNumber !== undefined && blockNumber !== null) {
      if (!Number.isInteger(blockNumber) || blockNumber < 0) {
        return res.status(400).json({
          statusCode: 400,
          message: "Block number must be a non-negative integer",
        });
      }
    }

    const market = markets.find((m: AaveMarketDataType) => m.id === marketId);

    if (!market) {
      return res.status(400).json({
        statusCode: 400,
        message: `Market not found: ${marketId}`,
      });
    }

    const data = [];

    for (const address of addresses) {
      const hf = (await getAaveData(
        address,
        market,
        blockNumber
      )) as HealthFactorData;
      if (isAbbreviated && hf.workingData) hf.workingData.address = address; // we want the address included with abbrev. data (for generating test data fixtures)
      data.push(isAbbreviated ? hf.workingData : hf);
      await timer(500);
    }
    res.status(200).json(data);
  } catch (err: any) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

export default handler;
