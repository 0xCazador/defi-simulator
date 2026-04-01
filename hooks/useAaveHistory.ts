import { useEffect } from "react";
import { TxHistory, useAaveData } from './useAaveData';

/** hook to fetch user aave tx data
 * @returns { history: TxHistory }
 */
export function useAaveHistory(address: string, resolvedAddress: string) {
    const { addressData, setTxHistory, currentMarket } = useAaveData(address, true);
    const history = addressData?.[currentMarket]?.workingData?.txHistory;
    const isFetchingHistory: boolean = !!history?.isFetching;

    useEffect(() => {
        if (isFetchingHistory) return;
        if (!!history?.lastFetched) return;

        const fetchData = async () => {
            const txHistory: TxHistory = {
                data: [],
                isFetching: true,
                fetchError: "",
                lastFetched: 0
            }
            const controller = new AbortController();
            const timeoutId = window.setTimeout(() => controller.abort(), 12000);

            try {
                const options = {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ address: resolvedAddress?.toLowerCase(), marketId: currentMarket }),
                };
                const response: Response = await fetch("/api/aave/history", {
                    ...options,
                    signal: controller.signal,
                });

                if (response?.ok) {
                    const data = await response.json() || [];
                    setTxHistory(address, { ...txHistory, data, isFetching: false, lastFetched: Date.now() })
                } else {
                    const data = await response.json();
                    const message: string = `${response.statusText}: --- ${data?.message ?? ""}`;
                    setTxHistory(address, { ...txHistory, isFetching: false, lastFetched: Date.now(), fetchError: message })
                }
            } catch (error) {
                const message =
                    error instanceof DOMException && error.name === "AbortError"
                        ? "Request timed out while loading transaction history"
                        : `Network error: ${error}`;
                setTxHistory(address, {
                    ...txHistory,
                    isFetching: false,
                    lastFetched: Date.now(),
                    fetchError: message,
                })
            } finally {
                window.clearTimeout(timeoutId);
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
