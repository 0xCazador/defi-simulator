import { useEffect, useState } from "react";
import { AaveMarketDataType, TxHistory, TxHistoryItem, markets, useAaveData } from './useAaveData';

/** hook to fetch user aave tx data
 * @returns { history: TxHistory }
 */
export function useAaveHistory(address: string, resolvedAddress: string) {
    const { addressData, setTxHistory, currentMarket } = useAaveData(address);
    const history = addressData?.[currentMarket]?.workingData?.txHistory;
    const isFetchingHistory: boolean = !!history?.isFetching;

    useEffect(() => {
        if (isFetchingHistory) return;
        if (!!history?.lastFetched) return;

        const fetchData = async () => {
            const options = {
                method: "POST",
                body: JSON.stringify({ address: resolvedAddress?.toLowerCase(), marketId: currentMarket }),
            };
            const response: Response = await fetch("/api/aave/history", options);

            const txHistory: TxHistory = {
                data: [],
                isFetching: true,
                fetchError: "",
                lastFetched: 0
            }

            if (response?.ok) {
                // ok, use the response data
                const data = await response.json() || [];
                setTxHistory(address, { ...txHistory, data, isFetching: false, lastFetched: Date.now() })
            } else {
                // monkey up an errored TxHistory object
                const data = await response.json();
                const message: string = `${response.statusText}: --- ${data?.message ?? ""}`;
                setTxHistory(address, { ...txHistory, isFetching: false, lastFetched: Date.now(), fetchError: message })
            }
        };
        createInitial();
        fetchData();
    }, [address, history, isFetchingHistory, currentMarket]);

    const createInitial = () => {
        const txHistory: TxHistory = {
            data: [],
            isFetching: true,
            fetchError: "",
            lastFetched: 0
        };
        setTxHistory(address, txHistory);
    };

    return {
        history
    };
}
