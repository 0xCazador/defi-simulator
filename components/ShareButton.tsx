import { useState } from "react";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useLingui } from "@lingui/react";
import {
  ActionIcon,
  Button,
  CopyButton,
  Group,
  Image,
  Loader,
  Popover,
  Skeleton,
  Text,
  Tooltip,
} from "@mantine/core";
import { useRouter } from "next/router";
import { FiShare2 } from "react-icons/fi";
import { BsCheck2, BsTwitterX } from "react-icons/bs";
import { RxCopy } from "react-icons/rx";

import {
  SharePayload,
  encodeInlinePayload,
  getOgImageUrl,
  getOgImageUrlInline,
  getShareTweet,
  getShareUrl,
  getShareUrlInline,
  validateSharePayload,
} from "../utils/shareCard";

type ShareLinks = {
  url: string;
  imageUrl: string;
  tweet: string;
};

type ShareButtonProps = {
  /** Build the snapshot lazily — only when the user opens the popover. */
  buildPayload: () => SharePayload | null;
  /** Accessible label, e.g. "Share liquidation scenario" */
  label: string;
};

/**
 * Contextual share button: mints a snapshot of the parent module via
 * /api/share, then offers copy / X / native-share with an image preview.
 * If minting fails (Blobs outage, offline API) it falls back to the long
 * inline-payload URL — sharing always works.
 */
export default function ShareButton({ buildPayload, label }: ShareButtonProps) {
  const router = useRouter();
  const { i18n } = useLingui();
  const [opened, setOpened] = useState(false);
  const [links, setLinks] = useState<ShareLinks | null>(null);
  const [isMinting, setIsMinting] = useState(false);
  const [error, setError] = useState(false);
  // The OG PNG is rendered on demand and can take a few seconds; a skeleton
  // holds its place until the browser has decoded it.
  const [imageLoaded, setImageLoaded] = useState(false);

  const locale = router.locale ?? "en";

  const mint = async () => {
    if (links || isMinting) return;
    setError(false);
    const payload = validateSharePayload(buildPayload());
    if (!payload) {
      setError(true);
      return;
    }
    setIsMinting(true);
    try {
      const tweet = getShareTweet(payload.card, i18n);
      let id: string | null = null;
      try {
        const response = await fetch("/api/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (response.ok) id = (await response.json()).id ?? null;
      } catch {
        id = null;
      }
      if (id) {
        setLinks({
          url: getShareUrl(id, locale),
          imageUrl: getOgImageUrl(id, locale),
          tweet,
        });
      } else {
        const encoded = encodeInlinePayload(payload);
        setLinks({
          url: getShareUrlInline(encoded, locale),
          imageUrl: getOgImageUrlInline(payload.card, locale),
          tweet,
        });
      }
    } finally {
      setIsMinting(false);
    }
  };

  const handleOpenChange = (nextOpened: boolean) => {
    setOpened(nextOpened);
    if (nextOpened) mint();
  };

  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  /** Phones/tablets where the X app may be installed (iPadOS 13+ reports a
   * desktop Safari UA, so also treat touch-capable "Macintosh" as mobile). */
  const isMobileDevice = () =>
    /android|iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);

  const openTweetIntent = () => {
    if (!links) return;
    const params = new URLSearchParams({ text: links.tweet, url: links.url });
    // x.com directly, not twitter.com: the redirect hop would defeat
    // universal-link interception by the native app.
    const intent = `https://x.com/intent/post?${params.toString()}`;
    if (isMobileDevice()) {
      // Top-level navigation, not window.open: iOS universal links and
      // Android app links only reliably hand the URL to the installed X app
      // on a same-tab navigation. Without the app, the web composer loads
      // in-tab and back returns here.
      window.location.href = intent;
      return;
    }
    window.open(intent, "_blank", "noopener,noreferrer");
  };

  const nativeShare = () => {
    if (!links) return;
    navigator.share({ text: links.tweet, url: links.url }).catch(() => {
      /* user dismissed the sheet */
    });
  };

  return (
    <Popover
      width={320}
      position="bottom-end"
      withArrow
      shadow="md"
      opened={opened}
      onChange={handleOpenChange}
    >
      <Popover.Target>
        <Tooltip label={label} withArrow>
          <ActionIcon
            aria-label={label}
            onClick={() => handleOpenChange(!opened)}
          >
            <FiShare2 size={16} style={{ display: "block" }} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        {error && (
          <Text size="sm" c="dimmed">
            <Trans>Nothing to share yet — load a position first.</Trans>
          </Text>
        )}
        {!error && (isMinting || !links) && (
          <Group justify="center" p="md">
            <Loader size="sm" />
          </Group>
        )}
        {!error && links && (
          <>
            {!imageLoaded && (
              <Skeleton
                radius="sm"
                mb="xs"
                w="100%"
                /* reserve the OG image's 1200×630 footprint so the popover
                   doesn't jump when the real image swaps in */
                style={{ aspectRatio: "1200 / 630", height: "auto" }}
              />
            )}
            <Image
              /* same-origin path so the preview also renders on localhost
                 and deploy previews; the OG meta keeps the absolute URL */
              src={links.imageUrl.replace(/^https?:\/\/[^/]+/, "")}
              alt={t`Share preview image`}
              radius="sm"
              mb="xs"
              w="100%"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageLoaded(true)}
              style={imageLoaded ? undefined : { display: "none" }}
            />
            <Text size="xs" c="dimmed" mb="xs" truncate>
              {links.url}
            </Text>
            <Group gap="xs" grow>
              <CopyButton value={links.url}>
                {({ copied, copy }) => (
                  <Button
                    size="compact-sm"
                    variant={copied ? "light" : "default"}
                    color={copied ? "teal" : undefined}
                    leftSection={
                      copied ? <BsCheck2 size={14} /> : <RxCopy size={14} />
                    }
                    onClick={copy}
                  >
                    {copied ? <Trans>Copied</Trans> : <Trans>Copy link</Trans>}
                  </Button>
                )}
              </CopyButton>
              <Button
                size="compact-sm"
                variant="default"
                leftSection={<BsTwitterX size={14} />}
                onClick={openTweetIntent}
              >
                <Trans>Post</Trans>
              </Button>
              {canNativeShare && (
                <Button
                  size="compact-sm"
                  variant="default"
                  leftSection={<FiShare2 size={14} />}
                  onClick={nativeShare}
                >
                  <Trans>Share</Trans>
                </Button>
              )}
            </Group>
          </>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
