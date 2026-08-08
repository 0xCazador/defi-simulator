type AbbreviatedEthereumAddressProps = {
  address: string;
};

export const AbbreviatedEthereumAddress = ({
  address,
}: AbbreviatedEthereumAddressProps) => {
  if (address?.length < 14) return <>{`${address}`}</>;
  return <>{`${address?.slice(0, 4)}...${address?.slice(-6)}`}</>;
};

export default AbbreviatedEthereumAddress;
