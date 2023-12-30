import { NextApiRequest, NextApiResponse } from "next";
import { AaveMarketDataType, markets, TxHistoryItem } from '../../../../hooks/useAaveData';

const allowedMethods = ["POST", "OPTIONS"];

const handler = async (_req: NextApiRequest, res: NextApiResponse) => {
  try {
    if (!allowedMethods.includes(_req.method!)) {
      return res.status(405).send({ message: "Method not allowed." });
    }
    const { address } = JSON.parse(_req.body);
    const { marketId } = JSON.parse(_req.body);

    const market = markets.find(
      (m: AaveMarketDataType) => m.id === marketId
    ) as AaveMarketDataType;

    if (!market?.subgraphUrl?.length) {
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
  const req = {
    query: market.v3 ? V3_QUERY : V2_QUERY,
    variables: { userAddress: address, first: 1000, skip: 0 },
  };

  const res = await fetch(market.subgraphUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    throw new Error(`Err requesting tx data: ${res.status} - ${res.statusText}`);
  }

  const data = await res.json();
  return data.data.userTransactions || [];
};

export default handler;


const V3_QUERY = `
query TxHistory($userAddress: String!, $first: Int!, $skip: Int!) {
  userTransactions(where: { user: $userAddress }, orderBy: timestamp, orderDirection: asc, first: $first, skip: $skip) {
    id
    timestamp
    txHash
    action
    ... on Supply {
      amount
      reserve {
        symbol
        decimals
        name
        underlyingAsset
      }
      assetPriceUSD
    }
    ... on RedeemUnderlying {
      amount
      reserve {
        symbol
        decimals
        name
        underlyingAsset
      }
      assetPriceUSD
    }
    ... on Borrow {
      amount
      borrowRateMode
      reserve {
        symbol
        decimals
        name
        underlyingAsset
      }
      assetPriceUSD
    }
    ... on UsageAsCollateral {
      fromState
      toState
      reserve {
        symbol
        name
        underlyingAsset
      }
    }
    ... on Repay {
      amount
      reserve {
        symbol
        decimals
        name
        underlyingAsset
      }
      assetPriceUSD
    }
    ... on SwapBorrowRate {
      borrowRateModeFrom
      borrowRateModeTo
      variableBorrowRate
      stableBorrowRate
      reserve {
        symbol
        decimals
        name
        underlyingAsset
      }
    }
    ... on LiquidationCall {
      collateralAmount
      collateralReserve {
        symbol
        decimals
        name
        underlyingAsset
      }
      principalAmount
      principalReserve {
        symbol
        decimals
        name
        underlyingAsset
      }
      collateralAssetPriceUSD
      borrowAssetPriceUSD
    }
  }
}
`;


export const V2_QUERY = `
query TxHistory($userAddress: String!, $first: Int!, $skip: Int!) {
  userTransactions(where: { user: $userAddress }, orderBy: timestamp, orderDirection: asc, first: $first, skip: $skip) {
    id
    timestamp
    txHash
    action
    ... on Deposit {
      amount
      reserve {
        symbol
        decimals
        name
        underlyingAsset
      }
      assetPriceUSD
    }
    ... on RedeemUnderlying {
      amount
      reserve {
        symbol
        decimals
        name
        underlyingAsset
      }
      assetPriceUSD
    }
    ... on Borrow {
      amount
      borrowRateMode
      reserve {
        symbol
        decimals
        name
        underlyingAsset
      }
      assetPriceUSD
    }
    ... on UsageAsCollateral {
      fromState
      toState
      reserve {
        symbol
        name
        underlyingAsset
      }
    }
    ... on Repay {
      amount
      reserve {
        symbol
        decimals
        name
        underlyingAsset
      }
      assetPriceUSD
    }
    ... on Swap {
      borrowRateModeFrom
      borrowRateModeTo
      variableBorrowRate
      stableBorrowRate
      reserve {
        symbol
        decimals
        name
        underlyingAsset
      }
    }
    ... on LiquidationCall {
      collateralAmount
      collateralReserve {
        symbol
        decimals
        name
        underlyingAsset
      }
      principalAmount
      principalReserve {
        symbol
        decimals
        name
        underlyingAsset
      }
      collateralAssetPriceUSD
      borrowAssetPriceUSD
    }
  }
}
`;
