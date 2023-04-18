import {
  createStyles,
  Text,
  Container,
  ActionIcon,
  Group,
  Title,
  Divider,
  Center,
} from '@mantine/core';
import { BiGhost } from 'react-icons/bi';
import { FaPiggyBank } from 'react-icons/fa';
import { BsTwitter, BsGithub } from 'react-icons/bs';

const useStyles = createStyles((theme) => ({
  footer: {
    marginTop: 40,
    paddingTop: 20,
  },

  logo: {
    maxWidth: 200,

    [theme.fn.smallerThan('sm')]: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    },
  },

  description: {
    marginTop: 5,

    [theme.fn.smallerThan('sm')]: {
      marginTop: theme.spacing.xs,
      textAlign: 'center',
    },
  },

  inner: {
    display: 'flex',
    justifyContent: 'space-between',

    [theme.fn.smallerThan('sm')]: {
      flexDirection: 'column',
      alignItems: 'center',
    },
  },

  groups: {
    display: 'flex',
    flexWrap: 'wrap',

    [theme.fn.smallerThan('sm')]: {
      display: 'none',
    },
  },

  wrapper: {
    width: 160,
  },

  link: {
    display: 'block',
    color: theme.colorScheme === 'dark' ? theme.colors.dark[1] : theme.colors.gray[6],
    fontSize: theme.fontSizes.sm,
    paddingTop: 3,
    paddingBottom: 3,

    '&:hover': {
      textDecoration: 'underline',
    },
  },

  title: {
    fontSize: theme.fontSizes.lg,
    fontWeight: 700,
    fontFamily: `Greycliff CF, ${theme.fontFamily}`,
    color: theme.colorScheme === 'dark' ? theme.white : theme.black,
  },

  afterFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.xl,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xl,
    borderTop: `1px solid ${theme.colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[2]
      }`,

    [theme.fn.smallerThan('sm')]: {
      flexDirection: 'column',
    },
  },

  social: {
    [theme.fn.smallerThan('sm')]: {
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
            DeFi Simulator is an unofficial, open source, community-built Aave debt simulator.
          </Text>
        </div>

        <Divider orientation="vertical" />

        <Center>
          <Text size="xs" c="dimmed">
            Questions or comments? Please find me on Twitter{' '}
            <a href="https://twitter.com/0xCazador" target="_blank" rel="noreferrer">
              @OxCazador
            </a>
          </Text>
        </Center>
      </Container>
      <Container className={classes.afterFooter}>
        <Text color="dimmed" size="sm" mb={15}>
          © defisim.xyz. All rights reserved.
        </Text>

        <Group spacing={0} className={classes.social} position="right" noWrap>
          <ActionIcon size="lg" component="a" href="https://twitter.com/0xCazador">
            <BsTwitter size="1.05rem" />
          </ActionIcon>
          <ActionIcon size="lg" component="a" href="https://github.com/0xcazador/defi-simulator">
            <BsGithub size="1.05rem" />
          </ActionIcon>
        </Group>
      </Container>
    </footer>
  );
}
