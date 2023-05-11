import * as React from 'react';

import {
  Button,
  Group,
  Modal,
  List,
  TextInput,
  Tooltip,
  ActionIcon,
  Text,
  Center,
} from '@mantine/core';
import { RxReset } from 'react-icons/rx';
import {
  useAaveData,
  ReserveAssetDataItem,
  BorrowedAssetDataItem,
} from '../hooks/useAaveData';

type AddAssetDialogProps = {
  assetType: 'BORROW' | 'RESERVE';
};

export default function AddAssetDialog({ assetType }: AddAssetDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [searchText, setSearchText] = React.useState('');
  const { addressData, currentMarket, addBorrowAsset, addReserveAsset } = useAaveData('');

  const handleClose = () => {
    setSearchText('');
    setOpen(false);
  };

  const handleAddAsset = (asset: string) => {
    assetType === 'BORROW' ? addBorrowAsset(asset) : addReserveAsset(asset);
    handleClose();
  };

  const assets = open
    ? new Array(...(addressData?.[currentMarket]?.availableAssets || []))
      .sort((a, b) => {
        // alpha sort by symbol
        if (a.symbol.toUpperCase() < b.symbol.toUpperCase()) {
          return -1;
        }
        if (a.symbol.toUpperCase() > b.symbol.toUpperCase()) {
          return 1;
        }
        return 0;
      })
      .filter((asset) => {
        // filter name/symbol by search text, if there is any
        if (!searchText.length) return true;
        if (
          asset.name.toUpperCase().includes(searchText.toUpperCase()) ||
          asset.symbol.toUpperCase().includes(searchText.toUpperCase())
        ) return true;
        return false;
      })
      .filter((asset) => {
        // filter out assets that are already in the CDP
        const reserves = addressData?.[currentMarket]?.workingData
          ?.userReservesData as ReserveAssetDataItem[];
        const borrows = addressData?.[currentMarket]?.workingData
          ?.userBorrowsData as BorrowedAssetDataItem[];
        return assetType === 'RESERVE'
          ? !reserves.find((item) => item.asset.symbol === asset.symbol)
          : !borrows.find((item) => item.asset.symbol === asset.symbol);
      })
    : new Array(...(addressData?.[currentMarket]?.availableAssets || []));

  return (
    <>
      <Modal
        opened={open}
        onClose={() => {
          setSearchText('');
          setOpen(false);
        }}
        title={`Add ${assetType === 'BORROW' ? 'Borrow' : 'Reserve'} Asset`}
      >
        <TextInput
          value={searchText}
          label={`Search for ${assetType === 'BORROW' ? 'Borrow' : 'Reserve'} Assets`}
          onChange={(e) => setSearchText(e.target.value)}
          size="sm"
          mb={8}
          style={{}}
          inputWrapperOrder={['label', 'error', 'input', 'description']}
          rightSection={
            searchText?.length > 0 && (
              <Tooltip label="Reset search query" position="top-end" withArrow>
                <ActionIcon>
                  <RxReset
                    size={18}
                    style={{ display: 'block' }}
                    onClick={() => setSearchText('')}
                  />
                </ActionIcon>
              </Tooltip>
            )
          }
        />

        {assets.length === 0 ? (
          <Center>
            <Text mt={15} mb={15}>
              There are no assets that match the search query. Reset the search query to select an
              asset.
            </Text>
          </Center>
        ) : (
          <Text mb={8}>
            {`Select ${assets.length === 1 ? 'the' : 'one of the'} (${assets.length}) ${assets.length === 1 ? 'asset' : 'assets'
              } below to add it as a ${assetType === 'BORROW' ? 'borrow' : 'reserve'
              } asset to the CDP.`}
          </Text>
        )}

        <List>
          {assets.map((asset) => {
            const iconName = asset.symbol.toLowerCase().replace('.e', '').replace('.b', '').replace('m.', '');
            return (
              <List.Item
                key={asset.symbol}
                onClick={() => handleAddAsset(asset.symbol)}
                style={{ cursor: 'pointer ' }}
                m={5}
                icon={
                  <img
                    src={`/icons/tokens/${iconName}.svg`}
                    width="30px"
                    height="30px"
                    alt={`${asset.symbol}`}
                  />
                }
              >
                {`${asset.name} (${asset.symbol})`}
              </List.Item>
            );
          })}
        </List>
      </Modal>

      <Group position="center">
        <Button variant="outline" onClick={() => setOpen(true)}>
          {`Add ${assetType === 'BORROW' ? 'Borrow' : 'Reserve'} Asset`}
        </Button>
      </Group>
    </>
  );
}
