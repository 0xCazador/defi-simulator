import { Children, cloneElement, ReactElement, ReactNode } from "react";
import { useRouter } from "next/router";
import { Button } from "@mantine/core";
import { Trans } from "@lingui/react/macro";

type RandomAddressButtonProps = {
  children?: ReactNode;
};

const getRandomInt = (min: number, max: number) => {
  const lower = Math.ceil(min);
  const upper = Math.floor(max);
  return Math.floor(Math.random() * (upper - lower) + lower);
};

// Random Aave CDP addresses — refreshed via `node scripts/refreshRandomAddresses.js`
// (live aToken/vToken participants scored by userMarketState; collateral≥$200k, debt≥$40k).
const addresses = [
  "0x46db0650645f7c9a29783c89171a62240ccc35cf",
  "0x0f8dd218ee17eee03d254805f84c7ba613e45e62",
  "0x9cbf099ff424979439dfba03f00b5961784c06ce",
  "0xb7fb2b774eb5e2dad9c060fb367acbdc7fa7099b",
  "0x96c9487af21d18ac5f4c841af44a011968445709",
  "0xfdab4d4fd0f6fbe4033955faad0e9dd00ec00407",
  "0xa3d843b6a057504284006bef6f34a2e9bc80fb6b",
  "0xb329504622bd79329c6f82cf8c60c807df2090c4",
  "0x72655b3926db3afbe914a53b0604905af7ce11a5",
  "0x3f60008dfd0efc03f476d9b489d6c5b13b3ebf2c",
  "0xe883426b4fc84a7f5cc86415cabbef43e73a4cc8",
  "0xd1895f2019c2152fc2b9022d57f19198c4cfcabc",
  "0x5900c3b72458f12967dc1bef35b92d271f5cdbc1",
  "0x523b27014b865c4d8f3dac9c6e3b1bad13d22b87",
  "0xb3277d631f2cb651b3cbc5a54fccdabe69d12942",
  "0x3e212f136244465d8e524fb658e6daa1fb0593bf",
  "0xb47219ccd98eae1f40987c672442c2cce9a31605",
  "0x79d77c06f860add562ddac4da3d4d2120970dd68",
  "0x7cc2ca053296ceeb6a865d11eb7b15d8bcbf45a0",
  "0xfc46d4a74fdcb41c883a5177ea3df61f6016b56b",
  "0xb32cb14f2a5b17d1f1343749e302316be5133321",
  "0xfb74196eccf35a260dd5cfd300baa37ae058b6c0",
  "0xa6fbeaac65de6d6fc900d95932d9320aad9128f0",
  "0xf03e3440f5f382dd65467784bd5411a0c1378d4d",
  "0x481c7823e54f000aa278bab4c001971177737aec",
  "0x5a67a213718769e85ef8000c90e14708721f381c",
  "0x3d6c8c147d0033d1615cfab698e4f9a55f273206",
  "0x4a5e7e97a7374bc9e802c19a599c16c0af077aa3",
  "0xad9d3a03648dbcc27aa458238474a1ff88234acf",
  "0x03b99c3d4ea494551b8c02709b006a0b71fefcad",
  "0xf8a12d1c8adf1295ade12ca69b22687dc0e0e752",
  "0xd3b5a874b3376d12fea0690db391ac6e167156ed",
  "0xb4c11a955979685c89c9abb032856dc23dedf80b",
  "0x856565db827588a88780454863f98a4a323e13aa",
  "0x24a2535c39242c11fe99fd8b690bf81ab23d9576",
  "0xc98b5ef1ab3587e2c53013c822252578b9a056e2",
  "0x3145cb0695416effe6ec9585e706f47b6c3c6599",
  "0xd7583e3cf08bbcab66f1242195227bbf9f865fda",
  "0xab0d6db22fb533e2195d137e114dd22a5a52c0ae",
  "0x7ac0db5dfa7d1dc7d1901b9ad50e8bb1813b140e",
  "0x166ce42df5f4baa94abc5b62c60dab1b3c73d2a3",
  "0x3af4a49c8e2fcaf33fd3389543b80d320fcc9091",
  "0xf0bb20865277abd641a307ece5ee04e79073416c",
  "0x9600a48ed0f931d0c422d574e3275a90d8b22745",
  "0xabdbbd00fad79b257e7313b398a1ea10d9eef8d6",
  "0x893aa69fbaa1ee81b536f0fbe3a3453e86290080",
  "0x7cd0b7ed790f626ef1bd42db63b5ebeb5970c912",
  "0xf34d97c680803358a468e3c56337defaf85ca6da",
  "0xc468315a2df54f9c076bd5cfe5002ba211f74ca6",
  "0xcdfa7efe670869c6b6be4375654e0b206ef49c89",
  "0x99926ab8e1b589500ae87977632f13cf7f70f242",
  "0x28a55c4b4f9615fde3cdaddf6cc01fcf2e38a6b0",
  "0x7ee29373f075ee1d83b1b93b4fe94ae242df5178",
  "0x741aa7cfb2c7bf2a1e7d4da2e3df6a56ca4131f3",
  "0x4f87de7d21aef48090958f7342e1f69dff790545",
  "0xe40d278afd00e6187db21ff8c96d572359ef03bf",
  "0x34780c209d5c575cc1c1ceb57af95d4d2a69ddcf",
  "0xf7462251c14d2fb83c7ab96367a7985423c83010",
  "0x40e93a52f6af9fcd3b476aedadd7feabd9f7aba8",
  "0x7bee8d37fba61a6251a08b957d502c56e2a50fab",
  "0xe84a061897afc2e7ff5fb7e3686717c528617487",
  "0xd848f54280f8fe8661b796e3bb8d8922c87af452",
  "0x7055b17a1b911b6b971172c01ff0cc27881aea94",
  "0xda43cce1263c1b8c8bfacf517fc7dd19d7dd41bd",
  "0xcf0a12cbd8088fc5f84ad431e71787157041cd69",
  "0x0a0fa2b02ae73bd9eb4c1e086458099eca42476e",
  "0xdc3abf85e090528669cf1b44ef4082b269c21a95",
  "0xc3fe8b63ea05e8e27b3f3358d646915d7ed931e4",
  "0x973ddb8ee2c9cc87e853c8d46253840c63951683",
  "0x755013a759c6c56d95b687ef4b2b9864f3654e60",
  "0x2bd72f8fb377337c9cc16da4dd2dd274537ffb82",
];

export const RandomAddressButton = ({ children }: RandomAddressButtonProps) => {
  const router = useRouter();
  const address = addresses[getRandomInt(0, addresses.length)];

  const renderChildren = () =>
    Children.map(children, (child) =>
      cloneElement(child as ReactElement<{ onClick?: () => void }>, {
        onClick: () => router.push(`?address=${address}`),
      }),
    );

  return children ? (
    <span>{renderChildren()}</span>
  ) : (
    <Button onClick={() => router.push(`?address=${address}`)}>
      <Trans>Use Random Address</Trans>
    </Button>
  );
};
