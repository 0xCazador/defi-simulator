import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { ethers } from "ethers";
import { t } from "@lingui/core/macro";

import {
  ActionIcon,
  Group,
  TextInput,
  Tooltip,
  VisuallyHidden,
} from "@mantine/core";
import { FaCopy, FaExternalLinkAlt } from "react-icons/fa";
import { GiDiceSixFacesFive } from "react-icons/gi";
import { markets, useAaveData } from "../hooks/useAaveData";
import { useRandomAddress } from "./RandomAddressButton";
import classes from "./AddressInput.module.css";

// Rendered size of the action buttons. Their tap targets are widened past this
// in CSS to reach the 44px recommendation without stealing room from the
// address; the gap is what the extra width absorbs, so it has to be the
// difference between the two. The right section then has to reserve the whole
// cluster, otherwise a long address is drawn underneath the buttons.
const ACTION_SIZE = 36;
const ACTION_GAP = 8;
const ACTION_COUNT = 3;
const SECTION_WIDTH =
  ACTION_SIZE * ACTION_COUNT + ACTION_GAP * (ACTION_COUNT - 1) + 20;

type CopyState = "idle" | "copied" | "failed";

const COPY_TOOLTIP_COLOR: Record<CopyState, string | undefined> = {
  idle: undefined,
  copied: "green",
  failed: "red",
};

const AddressInput = () => {
  const [inputAddress, setInputAddress] = useState("");
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const goToRandomAddress = useRandomAddress();

  useEffect(
    () => () => {
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    },
    [],
  );

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

  // Each press restarts the countdown, so a rapid second press can't be cut
  // short by the timer the first one left running.
  const flashCopyState = (state: CopyState) => {
    setCopyState(state);
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    copyResetTimer.current = setTimeout(() => setCopyState("idle"), 2500);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inputAddress);
      flashCopyState("copied");
    } catch {
      // The clipboard can be refused outright (denied permission, insecure
      // context, unfocused document). Selecting the address gives the user a
      // manual route, which beats claiming a copy that never happened.
      inputRef.current?.select();
      flashCopyState("failed");
    }
  };

  // Copying and opening the explorer only mean something once the field holds
  // something addressable, so they stay in place but inert until then.
  const hasAddress =
    ethers.utils.isAddress(inputAddress) || isValidENSAddress(inputAddress);
  const explorerName = market?.explorerName ?? "";

  const copyMessage = {
    idle: t`Copy address to clipboard`,
    copied: t`Address copied to clipboard!`,
    failed: t`Couldn't copy automatically. The address is selected, so you can copy it yourself.`,
  }[copyState];

  return (
    <TextInput
      ref={inputRef}
      value={inputAddress || ""}
      size="lg"
      radius="md"
      placeholder="0x...1234 or bobloblaw.eth"
      aria-label={t`Ethereum address or ENS name`}
      classNames={{ input: classes.input }}
      onChange={(event) => setInputAddress(event.target.value?.trim())}
      inputWrapperOrder={["label", "error", "input", "description"]}
      rightSectionWidth={SECTION_WIDTH}
      rightSection={
        <Group gap={ACTION_GAP} wrap="nowrap" className={classes.actions}>
          <Tooltip label={t`Use Random Address`} position="bottom" withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              size={ACTION_SIZE}
              radius="md"
              className={classes.action}
              aria-label={t`Use Random Address`}
              onClick={goToRandomAddress}
            >
              <GiDiceSixFacesFive size={18} />
            </ActionIcon>
          </Tooltip>

          <Tooltip
            label={copyMessage}
            opened={copyState === "idle" ? undefined : true}
            color={COPY_TOOLTIP_COLOR[copyState]}
            position="bottom"
            multiline
            w={copyState === "failed" ? 220 : undefined}
            withArrow
          >
            <ActionIcon
              variant="subtle"
              color="gray"
              size={ACTION_SIZE}
              radius="md"
              className={classes.action}
              // Tinting is left to CSS, which owns the icon colour and would
              // otherwise win over a `color` prop.
              data-copy-state={copyState}
              aria-label={t`Copy address to clipboard`}
              disabled={!hasAddress}
              onClick={handleCopy}
            >
              <FaCopy size={15} />
            </ActionIcon>
          </Tooltip>

          <Tooltip
            label={t`View address on ${explorerName}`}
            position="bottom"
            withArrow
          >
            <ActionIcon
              component="a"
              href={
                hasAddress
                  ? market?.explorer.replace("{{ADDRESS}}", inputAddress)
                  : undefined
              }
              target="_blank"
              rel="noreferrer"
              variant="subtle"
              color="gray"
              size={ACTION_SIZE}
              radius="md"
              className={classes.action}
              // An anchor can't be `disabled`, so it is marked inert for
              // assistive tech and kept out of the tab order instead. The role
              // is explicit because dropping `href` also drops the implicit
              // link role, which would remove it from the tree entirely while
              // the sibling copy button still announces itself as disabled.
              role="link"
              aria-label={t`View address on ${explorerName}, opens in a new tab`}
              aria-disabled={!hasAddress || undefined}
              data-disabled={!hasAddress || undefined}
              tabIndex={hasAddress ? undefined : -1}
              onClick={(event) => {
                if (!hasAddress) event.preventDefault();
              }}
            >
              <FaExternalLinkAlt size={14} />
            </ActionIcon>
          </Tooltip>

          {/* Present from first render so the copy result is announced as a
              change to a live region rather than as new content. */}
          <VisuallyHidden role="status" aria-live="polite">
            {copyState === "idle" ? "" : copyMessage}
          </VisuallyHidden>
        </Group>
      }
    />
  );
};

export default AddressInput;

export const isValidENSAddress = (address: string) =>
  !!address?.length && address.length > 4 && address.endsWith(".eth");
