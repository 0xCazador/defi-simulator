import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { ethers } from "ethers";
import { t } from "@lingui/macro";

import { ActionIcon, Center, TextInput, Tooltip } from "@mantine/core";
import { FaCopy, FaExternalLinkAlt } from "react-icons/fa";
import { GiDiceSixFacesFive } from "react-icons/gi";
import { markets, useAaveData } from "../hooks/useAaveData";
import { RandomAddressButton } from "../pages";
import classes from "./AddressInput.module.css";

const AddressInput = () => {
  const [inputAddress, setInputAddress] = useState("");
  const [showCopied, setShowCopied] = useState(false);
  const router = useRouter();

  const { currentAddress, currentMarket } = useAaveData("");

  const market = markets.find((mkt) => mkt.id === currentMarket);

  useEffect(() => {
    if (
      ethers.utils.isAddress(inputAddress) ||
      isValidENSAddress(inputAddress)
    ) {
      handleSelectAddress(inputAddress);
    }
  }, [inputAddress]);

  useEffect(() => {
    if (currentAddress && currentAddress !== inputAddress)
      setInputAddress(currentAddress);
    if (inputAddress && !currentAddress) setInputAddress("");
  }, [currentAddress]);

  const handleSelectAddress = (address: string) => {
    setInputAddress(address);
    if (ethers.utils.isAddress(address) || isValidENSAddress(address)) {
      const query = { ...router?.query };
      query.address = address.trim();
      router.push({
        pathname: router.pathname,
        query,
      });
    } else {
      console.error("THE PROVIDED ADDRESS IS INVALID: ", address);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(inputAddress);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2500);
  };

  return (
    <TextInput
      value={inputAddress || ""}
      size="lg"
      radius="md"
      placeholder="0x...1234 or bobloblaw.eth"
      aria-label={t`Ethereum address or ENS name`}
      classNames={{ input: classes.input }}
      onChange={(event) => setInputAddress(event.target.value?.trim())}
      inputWrapperOrder={["label", "error", "input", "description"]}
      rightSection={
        <Center>
          <RandomAddressButton>
            <Tooltip label={t`Use Random Address`} position="left" withArrow>
              <ActionIcon
                bg="var(--mantine-color-dark-6)"
                pr={4}
                pl={4}
                aria-label={t`Use Random Address`}
              >
                <GiDiceSixFacesFive size={16} />
              </ActionIcon>
            </Tooltip>
          </RandomAddressButton>
          <Tooltip
            label={
              showCopied
                ? t`Address copied to clipboard!`
                : t`Copy address to clipboard`
            }
            opened={showCopied ? true : undefined}
            color={showCopied ? "green" : undefined}
            position="left"
            withArrow
          >
            <ActionIcon
              bg="var(--mantine-color-dark-6)"
              pr={8}
              aria-label={t`Copy address to clipboard`}
              onClick={handleCopy}
            >
              <FaCopy size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip
            label={t`View address on ${market?.explorerName}`}
            position="left"
            withArrow
          >
            <a
              title={t`Visit address details on Etherscan`}
              target="_blank"
              href={market?.explorer.replace("{{ADDRESS}}", inputAddress)}
              style={{
                color: "var(--mantine-color-dark-0)",
                marginRight: "44px",
                marginTop: "2px",
              }}
              rel="noreferrer"
            >
              <FaExternalLinkAlt size={16} />
            </a>
          </Tooltip>
        </Center>
      }
    />
  );
};

export default AddressInput;

export const isValidENSAddress = (address: string) =>
  !!address?.length && address.length > 4 && address.endsWith(".eth");
