import { NextApiRequest, NextApiResponse } from "next";
import { AaveMarketDataType, markets, MAX_TX_HISTORY_ITEMS, TxHistoryItem, TxHistoryReserveItem } from '../../../../hooks/useAaveData';

const AAVE_API_URL = "https://api.v3.aave.com/graphql";
const PAGE_SIZE = 50; // "FIFTY" is the largest page size supported by the Aave API

const allowedMethods = ["POST", "OPTIONS"];

const handler = async (_req: NextApiRequest, res: NextApiResponse) => {
  try {
    if (!allowedMethods.includes(_req.method!)) {
      return res.status(405).send({ message: "Method not allowed." });
    }
    const body = typeof _req.body === "string" ? JSON.parse(_req.body) : _req.body;
    const { address, marketId } = body;

    const market = markets.find(
      (m: AaveMarketDataType) => m.id === marketId
    ) as AaveMarketDataType;

    if (!market?.poolAddress?.length || !address?.length) {
      return res.status(200).json([]);
    }

    const data: TxHistoryItem[] = await getTxData(address, market);
    res.status(200).json(data);

  } catch (err: any) {
    console.error(err);
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

export const getTxData = async (address: string, market: AaveMarketDataType) => {
  const items: TxHistoryItem[] = [];
  let cursor: string | null = null;

  // The Aave API caps pages at 50 items, so walk the cursor until the history is
  // exhausted or we hit MAX_TX_HISTORY_ITEMS (consumers treat a maxed-out history
  // as truncated/unreliable).
  while (items.length < MAX_TX_HISTORY_ITEMS) {
    const req = {
      query: TX_HISTORY_QUERY,
      variables: {
        market: market.poolAddress,
        chainId: market.chainId,
        user: address,
        cursor,
      },
    };

    const res: Response = await fetch(AAVE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      throw new Error(`Err requesting tx data: ${res.status} - ${res.statusText}`);
    }

    const body: any = await res.json();

    if (body.errors?.length) {
      throw new Error(`Err requesting tx data: ${body.errors[0]?.message ?? "unknown GraphQL error"}`);
    }

    const page: any = body.data?.userTransactionHistory;
    const pageItems: any[] = page?.items || [];

    pageItems.forEach((item) => {
      const mapped = mapTxItem(item, items.length);
      if (mapped) items.push(mapped);
    });

    cursor = page?.pageInfo?.next || null;
    if (!cursor || pageItems.length < PAGE_SIZE) break;
  }

  return items;
};

const toReserveItem = (token: any): TxHistoryReserveItem => ({
  symbol: token?.symbol,
  decimals: token?.decimals,
  name: token?.name,
  underlyingAsset: token?.address,
});

const toUnixSeconds = (isoTimestamp: string): number =>
  Math.floor(new Date(isoTimestamp).getTime() / 1000);

const ACTION_BY_TYPENAME: { [typename: string]: TxHistoryItem["action"] } = {
  UserSupplyTransaction: "Supply",
  UserWithdrawTransaction: "RedeemUnderlying",
  UserBorrowTransaction: "Borrow",
  UserRepayTransaction: "Repay",
  UserUsageAsCollateralTransaction: "UsageAsCollateral",
  UserLiquidationCallTransaction: "LiquidationCall",
};

/** Map an Aave API tx item to the TxHistoryItem shape used throughout the app */
const mapTxItem = (item: any, index: number): TxHistoryItem | null => {
  const action = ACTION_BY_TYPENAME[item.__typename];
  if (!action) return null;

  const base = {
    // a tx can contain multiple events of the same type, so include the index for uniqueness
    id: `${item.txHash}-${item.__typename}-${index}`,
    txHash: item.txHash,
    action,
    timestamp: toUnixSeconds(item.timestamp),
  };

  if (action === "LiquidationCall") {
    return {
      ...base,
      collateralAmount: item.collateral?.amount?.amount?.raw,
      collateralReserve: toReserveItem(item.collateral?.reserve?.underlyingToken),
      collateralPriceUSD: item.collateral?.amount?.usdPerToken,
      principalAmount: item.debtRepaid?.amount?.amount?.raw,
      principalReserve: toReserveItem(item.debtRepaid?.reserve?.underlyingToken),
      principalPriceUSD: item.debtRepaid?.amount?.usdPerToken,
    };
  }

  if (action === "UsageAsCollateral") {
    return {
      ...base,
      reserve: toReserveItem(item.reserve?.underlyingToken),
    };
  }

  return {
    ...base,
    amount: item.amount?.amount?.raw,
    reserve: toReserveItem(item.reserve?.underlyingToken),
    assetPriceUSD: item.amount?.usdPerToken,
  };
};

export default handler;

const TX_HISTORY_QUERY = `
query TxHistory($market: EvmAddress!, $chainId: ChainId!, $user: EvmAddress!, $cursor: Cursor) {
  userTransactionHistory(
    request: { market: $market, chainId: $chainId, user: $user, orderBy: { date: ASC }, pageSize: FIFTY, cursor: $cursor }
  ) {
    items {
      __typename
      ... on UserSupplyTransaction {
        txHash
        timestamp
        amount { usdPerToken amount { raw } }
        reserve { underlyingToken { symbol name decimals address } }
      }
      ... on UserWithdrawTransaction {
        txHash
        timestamp
        amount { usdPerToken amount { raw } }
        reserve { underlyingToken { symbol name decimals address } }
      }
      ... on UserBorrowTransaction {
        txHash
        timestamp
        amount { usdPerToken amount { raw } }
        reserve { underlyingToken { symbol name decimals address } }
      }
      ... on UserRepayTransaction {
        txHash
        timestamp
        amount { usdPerToken amount { raw } }
        reserve { underlyingToken { symbol name decimals address } }
      }
      ... on UserUsageAsCollateralTransaction {
        txHash
        timestamp
        enabled
        reserve { underlyingToken { symbol name decimals address } }
      }
      ... on UserLiquidationCallTransaction {
        txHash
        timestamp
        collateral {
          amount { usdPerToken amount { raw } }
          reserve { underlyingToken { symbol name decimals address } }
        }
        debtRepaid {
          amount { usdPerToken amount { raw } }
          reserve { underlyingToken { symbol name decimals address } }
        }
      }
    }
    pageInfo { next }
  }
}
`;
