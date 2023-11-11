import type { NextApiRequest, NextApiResponse } from "next";

import {
  AaveMarketDataType,
  HealthFactorData,
  markets,
} from "../../../../hooks/useAaveData";
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
    const { addresses } = JSON.parse(_req.body);
    const { marketId } = JSON.parse(_req.body);
    const market = markets.find(
      (m: AaveMarketDataType) => m.id === marketId
    ) as AaveMarketDataType;
    const data = [];

    for (const address of addresses) {
      const hf = (await getAaveData(address, market)) as HealthFactorData;
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
