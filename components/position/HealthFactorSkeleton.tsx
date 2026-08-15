import {
  Center,
  Divider,
  Grid,
  Paper,
  Skeleton,
  Text,
  Title,
} from "@mantine/core";
import { Trans } from "@lingui/react/macro";

type HealthFactorSkeletonProps = {
  animate?: boolean;
};

export const HealthFactorSkeleton = ({
  animate,
}: HealthFactorSkeletonProps) => {
  const items = [1, 2, 3, 4, 5];
  return (
    <>
      <Divider
        my="sm"
        variant="dashed"
        labelPosition="center"
        label={
          <Title order={3}>
            <Skeleton height={35} width={175} animate={animate} />
          </Title>
        }
      />
      <Grid>
        <Grid.Col span={{ base: 6, lg: 3 }} style={{ textAlign: "center" }}>
          <Paper>
            <Text fz="xs">
              <Trans>{"Total Borrowed: "}</Trans>
            </Text>
            <Skeleton height={45} mb="xl" animate={animate} />
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 6, lg: 3 }} style={{ textAlign: "center" }}>
          <Text fz="xs">
            <Trans>{"Available to Borrow: "}</Trans>
          </Text>
          <Skeleton height={45} mb="xl" animate={animate} />
        </Grid.Col>
        <Grid.Col span={{ base: 6, lg: 3 }} style={{ textAlign: "center" }}>
          <Paper>
            <Text fz="xs">
              <Trans>{"Supplied Asset Value: "}</Trans>
            </Text>
            <Skeleton height={45} mb="xl" animate={animate} />
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 6, lg: 3 }} style={{ textAlign: "center" }}>
          <Text fz="xs">
            <Trans>{"Net Asset Value: "}</Trans>
          </Text>
          <Skeleton height={45} mb="xl" animate={animate} />
        </Grid.Col>
      </Grid>
      <Divider
        my="sm"
        variant="dashed"
        labelPosition="center"
        label={
          <Title order={3}>
            <Skeleton height={25} width={145} animate={animate} />
          </Title>
        }
      />
      <Divider
        my="sm"
        variant="dashed"
        labelPosition="center"
        label={
          <Title order={3}>
            <Skeleton height={25} width={145} animate={animate} />
          </Title>
        }
      />
      {items.map((item) => (
        <Paper shadow="xs" style={{ marginBottom: "50px" }} key={item}>
          <Skeleton height={20} width={175} mb="xl" animate={animate} />

          <Grid columns={17}>
            <Grid.Col span={8}>
              <Skeleton height={55} mb="xl" animate={animate} />
            </Grid.Col>
            <Grid.Col span={1}>
              <Center style={{ height: "100%" }}>
                <Skeleton height={10} mb="xl" animate={animate} />
              </Center>
            </Grid.Col>
            <Grid.Col span={8}>
              <Skeleton height={55} mb="xl" animate={animate} />
            </Grid.Col>
          </Grid>
          <Skeleton height={10} width={175} mb="xl" animate={animate} />
        </Paper>
      ))}
    </>
  );
};

export default HealthFactorSkeleton;
