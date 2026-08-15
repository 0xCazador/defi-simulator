import {
  Text,
  Container,
  ActionIcon,
  Group,
  Divider,
  Center,
} from "@mantine/core";
import { BiGhost } from "react-icons/bi";
import { BsTwitter, BsGithub, BsDiscord } from "react-icons/bs";
import { Trans } from "@lingui/react/macro";
import SelectLanguageDialog from "./SelectLanguageDialog";
import SelectCurrencyDialog from "./SelectCurrencyDialog";
import classes from "./Footer.module.css";

export default function FooterLinks() {
  return (
    <footer className={classes.footer}>
      <Container className={classes.inner}>
        <div className={classes.logo}>
          <BiGhost size={36} />
          <Text size="xs" c="dimmed" className={classes.description}>
            DeFi Simulator{" "}
            <Trans>
              is an unofficial, open source, community-built Aave debt simulator
              and liquidation calculator.
            </Trans>
          </Text>
        </div>
        <Divider orientation="vertical" />

        <Center>
          <Text size="xs" c="dimmed" mt="lg" mx="lg" display="block">
            <Trans>
              Questions or comments? Please{" "}
              <a
                href="https://discord.gg/VF64xjhXEs"
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--mantine-color-dark-0)" }}
              >
                join the Discord!
              </a>
            </Trans>
          </Text>
        </Center>
      </Container>
      <Container className={classes.afterFooter}>
        <Text c="dimmed" size="sm" mb={15}>
          defisim.xyz
        </Text>

        <Group gap={0} justify="flex-end" wrap="nowrap">
          <SelectLanguageDialog />
          <SelectCurrencyDialog />
        </Group>

        <Group
          gap={0}
          className={classes.social}
          justify="flex-end"
          wrap="nowrap"
        >
          <ActionIcon
            title="Link to Discord"
            aria-label="Link to Discord"
            size="lg"
            component="a"
            href="https://discord.gg/VF64xjhXEs"
            target="_blank"
          >
            <BsDiscord size="1.05rem" />
          </ActionIcon>
          <ActionIcon
            title="Link to Twitter"
            aria-label="Link to Twitter"
            size="lg"
            component="a"
            href="https://twitter.com/defisim"
            target="_blank"
          >
            <BsTwitter size="1.05rem" />
          </ActionIcon>
          <ActionIcon
            title="Link to GitHub"
            aria-label="Link to GitHub"
            size="lg"
            component="a"
            href="https://github.com/0xcazador/defi-simulator"
            target="_blank"
          >
            <BsGithub size="1.05rem" />
          </ActionIcon>
        </Group>
      </Container>
    </footer>
  );
}
