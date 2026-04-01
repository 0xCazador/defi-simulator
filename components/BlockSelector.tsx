import React, { useState, useEffect } from "react";
import {
  Group,
  ActionIcon,
  Badge,
  Button,
  Tooltip,
  NumberInput,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { FaChevronLeft, FaChevronRight, FaHome } from "react-icons/fa";
import { BiTime } from "react-icons/bi";
import { useAaveData } from "../hooks/useAaveData";

const BlockSelector = () => {
  const {
    selectedBlockNumber,
    isHistoryMode,
    setSelectedBlockNumber,
    goToLatestBlock,
    addressData,
    currentMarket,
  } = useAaveData("", true);

  const isXs = useMediaQuery("(max-width: 480px)");
  const inputWidth = isXs ? 88 : 120;

  // Get the actual fetched block number from the current market data
  const fetchedBlockNumber =
    addressData?.[currentMarket]?.fetchedBlockNumber ??
    addressData?.[currentMarket]?.selectedBlockNumber;
  const fetchError = addressData?.[currentMarket]?.fetchError;

  const [inputValue, setInputValue] = useState<number | undefined>(undefined);

  // Handle fetch errors (e.g., future block numbers)
  useEffect(() => {
    if (fetchError && fetchError.length > 0) {
      // Clear input and return to latest block
      setInputValue(undefined);
      goToLatestBlock();
    }
  }, [fetchError]);

  // Sync input with global state when exiting history mode
  useEffect(() => {
    if (!isHistoryMode && selectedBlockNumber === undefined) {
      // Clear input when history mode is exited
      setInputValue(undefined);
    }
  }, [isHistoryMode, selectedBlockNumber]);

  useEffect(() => {
    if (isHistoryMode && fetchedBlockNumber !== undefined) {
      setInputValue(fetchedBlockNumber);
    }
  }, [fetchedBlockNumber, isHistoryMode]);

  const handleBlockNumberSubmit = () => {
    if (inputValue !== undefined && inputValue >= 0) {
      setSelectedBlockNumber(inputValue);
    }
  };

  const handlePreviousBlock = () => {
    const currentBlock = fetchedBlockNumber;
    if (currentBlock && currentBlock > 0) {
      const newBlock = currentBlock - 1;
      setInputValue(newBlock);
      setSelectedBlockNumber(newBlock);
    }
  };

  const handleNextBlock = () => {
    const currentBlock = fetchedBlockNumber;
    if (currentBlock) {
      const newBlock = currentBlock + 1;
      setInputValue(newBlock);
      setSelectedBlockNumber(newBlock);
    }
  };

  const handleGoToLatest = () => {
    goToLatestBlock();
    setInputValue(undefined);
  };

  const handleInputChange = (value: number | "") => {
    setInputValue(value === "" ? undefined : value);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      handleBlockNumberSubmit();
    } else if (event.key === "ArrowUp" && fetchedBlockNumber !== undefined) {
      event.preventDefault();
      handleNextBlock();
    } else if (
      event.key === "ArrowDown" &&
      fetchedBlockNumber &&
      fetchedBlockNumber > 0
    ) {
      event.preventDefault();
      handlePreviousBlock();
    } else if (event.key === "Escape") {
      event.preventDefault();
      handleGoToLatest();
    }
  };

  return (
    <Group spacing="xs" align="center" noWrap>
      {/* History Mode Indicator */}
      {isHistoryMode && !isXs && (
        <Badge
          color="orange"
          variant="filled"
          leftSection={<BiTime size={12} />}
          size="sm"
        >
          History Mode
        </Badge>
      )}

      {/* Block Navigation Controls */}
      <Group spacing={4} align="center" noWrap>
        <Tooltip label="Previous Block" position="bottom">
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={handlePreviousBlock}
            disabled={!fetchedBlockNumber || fetchedBlockNumber <= 0}
            aria-label="Previous block"
          >
            <FaChevronLeft size={12} />
          </ActionIcon>
        </Tooltip>

        <Tooltip
          label="Enter: Go to block | ↑↓: Navigate | Esc: Latest"
          position="bottom"
          multiline
        >
          <NumberInput
            placeholder="Block number"
            value={inputValue ?? ""}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            size="xs"
            style={{ width: inputWidth }}
            min={0}
            hideControls
            aria-label="Block number"
          />
        </Tooltip>

        <Tooltip label="Next Block" position="bottom">
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={handleNextBlock}
            disabled={!fetchedBlockNumber}
            aria-label="Next block"
          >
            <FaChevronRight size={12} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {/* Action Buttons */}
      <Group spacing={4} noWrap>
        {!isXs && (
          <Button
            size="xs"
            variant="subtle"
            onClick={handleBlockNumberSubmit}
            disabled={inputValue === selectedBlockNumber}
          >
            Go
          </Button>
        )}

        {isHistoryMode && !isXs && (
          <Tooltip label="Go to Latest Block" position="bottom">
            <Button
              size="xs"
              variant="subtle"
              leftIcon={<FaHome size={12} />}
              onClick={handleGoToLatest}
              aria-label="Go to latest block"
            >
              Latest
            </Button>
          </Tooltip>
        )}
      </Group>
    </Group>
  );
};

export default BlockSelector;
