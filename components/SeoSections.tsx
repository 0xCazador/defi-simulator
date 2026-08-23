/**
 * The server-rendered, crawlable half of the indexable routes: the explanatory
 * copy, live reserve parameters, market list and FAQ.
 *
 * All copy arrives pre-resolved for the request locale (see utils/seoContent) —
 * no <Trans> here, because this is exactly the content that has to be correct
 * in the prerendered HTML rather than after hydration.
 *
 * The block is hidden once an address is loaded so the simulator stays
 * uncluttered. That is a client-side decision only: the static HTML for "/"
 * always contains it, so a crawler and a human requesting the same URL get the
 * same document.
 */
import Link from "next/link";
import { Anchor, Box, Group, Stack, Table, Text, Title } from "@mantine/core";

import { markets, useAaveData } from "../hooks/useAaveData";
import type {
  MarketSnapshot,
  MarketSnapshotEntry,
} from "../utils/marketSnapshot";
import type { IndexableRoute } from "../utils/seo";
import type { SeoContent } from "../utils/seoContent";
import classes from "./SeoSections.module.css";

type SeoSectionsProps = {
  route: IndexableRoute;
  content: SeoContent;
  snapshot: MarketSnapshot | null;
};

const pct = (value: number): string => `${(value * 100).toFixed(2)}%`;

/** Column values differ per route: risk parameters on the simulator, rates on
 * the interest page. The asset row itself is identical. */
const cellsFor = (
  route: IndexableRoute,
  asset: MarketSnapshotEntry["assets"][number],
): string[] =>
  route === "/interest"
    ? [pct(asset.supplyAPY), pct(asset.variableBorrowAPY), pct(asset.ltv)]
    : [
        pct(asset.ltv),
        pct(asset.liquidationThreshold),
        pct(asset.liquidationPenalty),
      ];

export default function SeoSections({
  route,
  content,
  snapshot,
}: SeoSectionsProps) {
  const { currentAddress } = useAaveData("");
  if (currentAddress) return null;

  return (
    <Box component="section" className={classes.section}>
      <Stack gap={40}>
        <Text fz="sm" c="dimmed" maw={760}>
          {content.intro}
        </Text>

        {content.sections.map((section) => (
          <Box key={section.heading}>
            <Title order={2} fz="h4" mb="sm">
              {section.heading}
            </Title>
            <Stack gap="sm" maw={760}>
              {section.blocks.map((block) =>
                block.kind === "formula" ? (
                  <code key={block.text} className={classes.formula}>
                    {block.text}
                  </code>
                ) : (
                  <Text key={block.text} fz="sm">
                    {block.text}
                  </Text>
                ),
              )}
            </Stack>
          </Box>
        ))}

        {snapshot && snapshot.markets.length > 0 && (
          <Box>
            <Title order={2} fz="h4" mb="sm">
              {content.table.heading}
            </Title>
            <Text fz="sm" mb="md" maw={760}>
              {content.table.intro}
            </Text>
            {snapshot.markets.map((market, index) => (
              <details
                key={market.id}
                className={classes.market}
                open={index === 0}
              >
                {/* Market titles already carry the protocol version
                    ("Ethereum v3"), and they're proper nouns, so nothing here
                    needs translating. */}
                <summary className={classes.marketSummary}>
                  {market.title}
                </summary>
                <div className={classes.marketTable}>
                  <Table fz="xs" striped>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{content.table.asset}</Table.Th>
                        <Table.Th ta="right">{content.table.primary}</Table.Th>
                        <Table.Th ta="right">
                          {content.table.secondary}
                        </Table.Th>
                        <Table.Th ta="right">{content.table.tertiary}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {market.assets.map((asset) => (
                        <Table.Tr key={asset.symbol}>
                          <Table.Td>{asset.symbol}</Table.Td>
                          {cellsFor(route, asset).map((cell, cellIndex) => (
                            <Table.Td
                              key={cellIndex}
                              ta="right"
                              style={{ whiteSpace: "nowrap" }}
                            >
                              {cell}
                            </Table.Td>
                          ))}
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </div>
              </details>
            ))}
            <Text fz="xs" c="dimmed" mt="xs">
              {content.asOf}{" "}
              <time
                dateTime={new Date(snapshot.generatedAt * 1000).toISOString()}
              >
                {new Date(snapshot.generatedAt * 1000)
                  .toISOString()
                  .slice(0, 10)}
              </time>
            </Text>
          </Box>
        )}

        <Box>
          <Title order={2} fz="h4" mb="sm">
            {content.marketsHeading}
          </Title>
          <Text fz="sm" mb="sm" maw={760}>
            {content.marketsIntro}
          </Text>
          {/* Sourced from the static market list, not the snapshot, so the
              full set is listed even when a reserve fetch failed. These carry
              ?market=, which the canonical folds back into this same URL —
              crawl paths without index bloat. */}
          <Group gap="xs">
            {markets.map((market) => (
              <Anchor
                key={market.id}
                component={Link}
                href={`${route}?market=${market.id}`}
                fz="sm"
              >
                {market.title}
              </Anchor>
            ))}
          </Group>
        </Box>

        <Box>
          <Title order={2} fz="h4" mb="sm">
            {content.faqHeading}
          </Title>
          <Stack gap="md" maw={760}>
            {content.faq.map((entry) => (
              <Box key={entry.question}>
                <Title order={3} fz="sm" mb={4}>
                  {entry.question}
                </Title>
                <Text fz="sm" c="dimmed">
                  {entry.answer}
                </Text>
              </Box>
            ))}
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}
