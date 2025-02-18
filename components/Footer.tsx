
import {
  createStyles,
  Text,
  Container,
  ActionIcon,
  Group,
  Title,
  Divider,
  Center,
} from "@mantine/core";
import { BiGhost } from "react-icons/bi";
import { BsTwitter, BsGithub, BsDiscord } from "react-icons/bs";
import { Trans } from "@lingui/macro";
import SelectLanguageDialog from "./SelectLanguageDialog";
import SelectCurrencyDialog from "./SelectCurrencyDialog";
import { MdNotificationsActive } from "react-icons/md";

const useStyles = createStyles((theme) => ({
  footer: {
    marginTop: 40,
    paddingTop: 20,
  },

  logo: {
    maxWidth: 200,

    [theme.fn.smallerThan("sm")]: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
    },
  },

  description: {
    marginTop: 5,

    [theme.fn.smallerThan("sm")]: {
      marginTop: theme.spacing.xs,
      textAlign: "center",
    },
  },

  inner: {
    display: "flex",
    justifyContent: "space-between",

    [theme.fn.smallerThan("sm")]: {
      flexDirection: "column",
      alignItems: "center",
    },
  },

  groups: {
    display: "flex",
    flexWrap: "wrap",

    [theme.fn.smallerThan("sm")]: {
      display: "none",
    },
  },

  wrapper: {
    width: 160,
  },

  link: {
    display: "block",
    color:
      theme.colorScheme === "dark"
        ? theme.colors.dark[1]
        : theme.colors.gray[6],
    fontSize: theme.fontSizes.sm,
    paddingTop: 3,
    paddingBottom: 3,

    "&:hover": {
      textDecoration: "underline",
    },
  },

  title: {
    fontSize: theme.fontSizes.lg,
    fontWeight: 700,
    fontFamily: `Greycliff CF, ${theme.fontFamily}`,
    color: theme.colorScheme === "dark" ? theme.white : theme.black,
  },

  afterFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: theme.spacing.xl,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xl,
    borderTop: `1px solid ${theme.colorScheme === "dark" ? theme.colors.dark[4] : theme.colors.gray[2]
      }`,

    [theme.fn.smallerThan("sm")]: {
      flexDirection: "column",
    },
  },

  social: {
    [theme.fn.smallerThan("sm")]: {
      marginTop: theme.spacing.xs,
    },
  },
}));

export default function FooterLinks() {
  const { classes } = useStyles();

  return (
    <footer className={classes.footer}>
      <Container className={classes.inner}>
        <div className={classes.logo}>
          <BiGhost size={36} />
          <Text size="xs" color="dimmed" className={classes.description}>
            DeFi Simulator{" "}
            <Trans>
              is an unofficial, open source, community-built Aave debt
              simulator and liquidation calculator.
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
                style={{ color: "#e9ecef" }}
              >
                join the Discord!
              </a>
            </Trans>
          </Text>
        </Center>
      </Container>
      <Container className={classes.afterFooter}>
        <Text color="dimmed" size="sm" mb={15}>
          defisim.xyz
        </Text>

        <Group spacing={0} position="right" noWrap>
          <SelectLanguageDialog />
          <SelectCurrencyDialog />
        </Group>

        <Group spacing={0} className={classes.social} position="right" noWrap>
          <ActionIcon
            title="Link to Discord"
            size="lg"
            component="a"
            href="https://discord.gg/VF64xjhXEs"
            target="_blank"
          >
            <BsDiscord size="1.05rem" />
          </ActionIcon>
          <ActionIcon
            title="Link to Twitter"
            size="lg"
            component="a"
            href="https://twitter.com/defisim"
            target="_blank"
          >
            <BsTwitter size="1.05rem" />
          </ActionIcon>
          <ActionIcon
            title="Link to GitHub"
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
