import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";

const allowedMethods = ["POST", "OPTIONS"];

const handler = async (_req: NextApiRequest, res: NextApiResponse) => {
  try {
    if (!allowedMethods.includes(_req.method!)) {
      res.status(405).send({ message: "Method not allowed." });
      return;
    }

    const { address } = JSON.parse(_req.body);
    let resolvedAddress = address;
    if (!ethers.utils.isAddress(address)) {
      resolvedAddress =
        (await getResolvedAddress(address)) ||
        "0x87cCC67f0c1b67745989542152DD4acff3841CD6";
    }

    res.status(200).send(resolvedAddress);
  } catch (err: any) {
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

export const getResolvedAddress = async (address: string) => {
  if (ethers.utils.isAddress(address)) return address;
  const provider = new ethers.providers.StaticJsonRpcProvider(
    `https://eth-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
    1,
  );
  return provider.resolveName(address);
};

export default handler;
