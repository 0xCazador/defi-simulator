import {
  Alert,
  Button,
  Center,
  Container,
  Divider,
  Space,
  Text,
} from "@mantine/core";
import { FiAlertTriangle } from "react-icons/fi";
import {
  useEffect,
  useState,
  Children,
  cloneElement,
  ReactElement,
} from "react";
import { NextRouter, useRouter } from "next/router";
import { ethers } from "ethers";
import { Trans, t } from "@lingui/macro";

import { useAaveData } from "../hooks/useAaveData";
import AppBar from "../components/AppBar";
import AddressInput, { isValidENSAddress } from "../components/AddressInput";
import AddressCard from "../components/AddressCard";
import Footer from "../components/Footer";
import { activateLocale } from "./_app";

export default function HomePage() {
  const router: NextRouter = useRouter();
  const address = router?.query?.address as string;
  const isValidAddress: boolean =
    ethers.utils.isAddress(address) || isValidENSAddress(address);
  const { currentAddress, setCurrentAddress } = useAaveData(
    isValidAddress ? address : ""
  );

  const locale = router?.locale;

  useEffect(() => {
    // ensure current address is correctly set from url
    if (!address && currentAddress) {
      setCurrentAddress("");
    }
    if (router.query.address && router.query.address !== currentAddress) {
      if (isValidAddress) {
        setCurrentAddress(address);
      }
    }
  }, [address]);

  useEffect(() => {
    // ensure current locale is correctly set from url
    if (locale) activateLocale(locale);
  }, [locale]);

  return (
    <Container px="xs" style={{ contain: "paint" }}>
      <AppBar />
      <AddressInput />
      {currentAddress && <AddressCard />}
      {!currentAddress && <SplashSection />}
      <ExperimentalAlert />
      <Footer />
    </Container>
  );
}

const SplashSection = () => {
  const router: NextRouter = useRouter();
  return (
    <>
      <Center mt={15}>
        <Text fz="md" ta="center" span>
          <Trans>
            Paste an address with an Aave debt position in the box above to
            visualize how changes to borrow/supplied assets affect the position's
            health factor and borrowing power.
          </Trans>
        </Text>
      </Center>

      <Divider my="sm" variant="dashed" labelPosition="center" label={t`OR`} />

      <Center mt={15}>
        <Text fz="md" ta="center">
          <Trans>Want to go for a quick spin?</Trans>
        </Text>
      </Center>

      <Space h="md" />

      <Center>
        <RandomAddressButton />
      </Center>

      <Center mt={15}>
        <Text fz="md" ta="center">
          <Trans>Create a new simulated position in any Aave market:</Trans>
        </Text>
      </Center>

      <Space h="md" />

      <Center>
        <Button onClick={() => router.push("?address=sandbox.eth")}>
          <Trans>Build from Scratch</Trans>
        </Button>
      </Center>
    </>
  );
};

type RandomAddressButtonProps = {
  children?: React.ReactNode;
};

export const RandomAddressButton = ({ children }: RandomAddressButtonProps) => {
  const router = useRouter();

  const getRandomInt = (min: number, max: number) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
  };

  // Random Aave CDP addresses
  const addresses = [
    "0xdd3ce394499a997ea26f0f3f1c8a57355b74743b",
    "0x198518d878fae7c0eed4adff5d735eeeff091bf7",
    "0x36af43ce4234007c7daf758059b30922359f580a",
    "0x09680e225e0310540df56d6972ea6ff0278314c4",
    "0xd4b0c740671e5235c2cdecef9503be4545be53bf",
    "0x190da10cf7cb0b4dd53c126dc36d1519f0ce9876",
    "0xa7e0c22a0fbf3b2a1fe3039be1c14c9cdaad84bb",
    "0x0ed4ee4bd745cd3b0565df548cf0d2e3dc76e54a",
    "0x40a3720bd4faf7146a95dfaa09efa0248bf39875",
    "0xf2bbd77d1cc8175b8525cd6c43d8414e1dd5f628",
    "0x8b9a950670bdb303067c13a2ca92a4a018a121fc",
    "0x3ddd3152aa2fb59a59fe1923671bf328a73df60d",
    "0x3afdc3bc20bce71dede98a9b7823599b4776e50d",
    "0x512e448fd976addcea2077708078abd5a340fe9b",
    "0xd43fb19a89037efbaa596b22dc804a49a08d6fa8",
    "0x615cbc5206aadb34bc1a8efa381606e18c068878",
    "0x90165b859165d6ba353d44ffadfcd54aa4c9c58b",
    "0xecf4e618d8554e357f40b5a92fdde93fb4a0bf7a",
    "0xc61def82714cb1bd2ae9ad2e671fbedacb68e8a3",
    "0xf25361d7fbc6ff7080f62c5fc1a6f2fbd0822547",
    "0xdbe1c94c31066141649968630cedd24a615b2185",
    "0x2004382af56c7d4a8753b81d3197d91c168561af",
    "0x4f2c859e52cb185ad3d53f273019a6e1864e30f8",
    "0x379f29c017ec33e145d1fe721971cc1b50a31253",
    "0xa57f09692bdac6286e58ad0d3c8ee315258a15e9",
    "0xe4156c36e022990353f9c45594b12ebbc2117220",
    "0xd0a1dd1a8375eb30c82d8b4dffb6c5684310524a",
    "0xcb81224c4da0ecac13b240d89336babc0a05fd2c",
    "0xbfc7aef3fee5f9f00153238beec18bc7d57a8a33",
    "0x19368fd9aefc518023f212f64552855ff77ae101",
    "0x63064deefb1628e97ab22a56f8bff8bc9d66a4c8",
    "0x3750283aafdadbf1b4bf2ce3f2887173023de685",
    "0xeb064c6a1b7d2746c5268e742d9d5488295ae198",
    "0x308dbde9701e7a112c6ccd573f6856253e902e33",
    "0x3249ce4ba67ca31f7438b1cdf090f1746a55242a",
    "0x6e82db9ce7c80e2f283bf6b9ece3d67d866ba86e",
    "0x7993ff65747c876b93d4ed29bb5ce0d61c094f21",
    "0x1d9e324e5fce00e6fa955e453e3d1aa1f43f33e6",
    "0xaaa58bf2bec6db13bd8d8f42f3ce6e226f09a30e",
    "0x02d57e3042a854e4256aa17d5bdd4541d8c4d36c",
    "0x3b66bca9b58acb2e0894654f27edc96fa1b6b0f1",
    "0x0319bc4625896d0d8dd3c2d4c3fff7b5d611da44",
    "0x8279656ee8d1f3a06c17a46742d1b953bef0ff76",
    "0x1e08a0a0cb635f2df88b32a8226fb377f1f963ba",
    "0x8ac237e249302adc837cefc6464b5296a7da47bf",
    "0x494af2aa8f930a9232f7325c2c74b2736f6bd874",
    "0x8a1e8739b371560bf97a8e105d1c601bce00574e",
    "0x8f96aa1c4cbd3b10786c81031c6917bcac66423c",
    "0x9dbe79cb24c6f5fe6b07648a9051804b3c3fa72a",
    "0x3cb686eddf16e617e6cacc1ad9b0784118c6ceaf",
    "0x39d637737cc76c5849a52c7d3b872a1eb22aa71c",
    "0xa73971c5780f0d61cbec2a33af9c8083314c6cf6",
    "0x08bd9601dba577c5195dd57cdbee84f18e9831fd",
    "0x04b917bff85f5400e87866111a3e46b4ed82e40d",
    "0xeebceb35382651d0b4fbfbca8c48f117ef5a83ff",
    "0x9fa1f6a62e406602855fb1eb32da9941f536dcd2",
    "0xdf9f62333fa53fdd8b4f15e2e73af490c9ccd454",
    "0x0f36c6bcd45f4723ab38021bdfec8aed6188d4d9",
    "0x706289eb7a2d10ef50f6264a89eaab55b5847e90",
    "0x81b36a1f9a182ad5f231e70ae61d3ea7e54530ae",
    "0x9c9a0efc16e08070666a6c5518a17652c289f1e0",
    "0x2ca73b8757a1e439123035aaf97d580f9bac4363",
    "0x6176c0b7467d863d96ca2fdd72a1263784c3006c",
    "0x8bb931c03a12f83eaec330e88ddfc8b560a2156c",
    "0x2d464aaa7b8b7d05429fe6db76a9d8d4477f1336",
    "0xce6d09baa855f686bf3311f1be7878c5ddcfd1a2",
    "0x50ca41e4f27228d881998ad6a573082bad2a95a7",
    "0x43763d32a9df8a4311925259658b4c25c158a806",
    "0x7a11f18b5cf4f7b8b81ae57117f683efc3e2f3d7",
    "0x98bdbfaba719a46e0b5318a4ddb47f5b943ee93c",
    "0xc812cf7dd8872ed617eeac07eb25ef485bf3c124",
    "0x012e5fcdc8d9b552d85609c12b9c1b8254e545e9",
    "0x63006dadff35f3e3bf7ce896718064eaec6dece5",
    "0xf99506e6aaad3a68a7e75c6888e07d9550a3dcbd",
    "0xa80bea3c06dd49a73239a8fbe457eecd561a66f7",
    "0x8c3fdd55e928e5d6499388d6a7767e05782d642a",
    "0xd93103a23cd8c2d5dbaf16e32b684b39248c78c0",
    "0x82cbcb947b4defd1b54cfde27cf688d68da7b8f3",
    "0xe3fd346478bc75fd681dc389512ea89188cbebba",
    "0x83c989e4af7aca81066f4f7e3a29f190d88fb14a",
    "0x5dacd6934ee1091c470ad4695e0f4f95d7f43051",
    "0x0d18dd392ebdb2a79093e46be1e73fbcc5a6c387",
    "0xac4734d5cd80c12f3c90edc9dc5589c11ee17896",
    "0x4d6425bf47ed895880f9af4911e463aae7e6ee43",
    "0x8e5e433d08676d1ead59ecf1c9faa90dddd9e1d7",
    "0x09680e225e0310540df56d6972ea6ff0278314c4",
    "0x81d98c8fda0410ee3e9d7586cb949cd19fa4cf38",
    "0xca58a06f70ae751361ecfa06cfe4ae4d3f4ed9ab",
    "0x4ae31bd2f11de332707a113d333b94c3f20175c5",
    "0x61300de79422a18b69fd3afe4238ec5aa1df0635",
    "0xb7c247bf2953eea170a733ebbcf8601c0a92246f",
    "0xbcdf7bbbdd264e31e88a01be22105f8b8e2616b4",
    "0x0a96888e36cdaa408b3359262fb953c279c7ed96",
    "0x5b08dadb1e594cb9ede808a59c386ae54346ed91",
    "0xd8be91b252d6e3b97f3469ba52ff4dbf053a547c",
    "0x8b5c16c8914cdfd504d556f567ff88e4ccd7cf03",
    "0x353b3bedcd49e80e9ce99fb4e029bf4b1d42a459",
    "0x3742541ebeb25bfe52125e3e39ac17726d1319e7",
    "0xabf10d0daeccc8d1660ae7527c51373a427955ee",
    "0x39d6af81fca969dc092968bb8501147777a2b384",
    "0x91746d6f9df58b9807a5bb0e54e4ea86600c2dba",
    "0x6286b9f080d27f860f6b4bb0226f8ef06cc9f2fc",
    "0x5de64f9503064344db3202d95ceb73c420dccd57",
    "0xc6cc2331c15f9c676df2ad13531e8b23a4c57541",
    "0x98b221a032f525a9fa2107182b06630e4a7aab89",
    "0x52437e76e9d51e3459bc1be1c5a01e59065ad048",
    "0x35ebe8ff4e3af0c741f4f839f73ce4aa01c47a79",
    "0xefc9b8e8fcd4ace39bca9e999fde1bf73a961385",
    "0x14c32a94d825b0fbfc1a7024282f6bcaaa3082d1",
    "0xe34985b7e8d98b1d52f628c9de0b0b764f5083a3",
    "0xb7fb2b774eb5e2dad9c060fb367acbdc7fa7099b",
    "0xe88ab6fa7f02c3ed96985de5e50cca7ceea54d4e",
    "0xc9e4eb3a1777146ea9b8249903a47cdf2529da1e",
    "0xab92fca834aac2afe16cf6a2fc60cc7a864a77a5",
    "0x7bdc57a20bea89f99ca021f1cfc8d9ed772d5415",
    "0x6b972732179c94592781a5b1edf731577712eccf",
    "0x0d5e107992ebbfa97fa75cad9125314376152618",
    "0x47346c16a52e2f6b654daf69835b0186aca11bb9",
    "0x9cbf099ff424979439dfba03f00b5961784c06ce",
    "0xec6320c55202cdfc71a9c7eca8d2f4bd7fe3a037",
    "0x3496c181777458f350a560cc795b419ba61dd543",
    "0xac2827a29dea9dafbf5c2ac3db0b8e2fe76d19db",
    "0x1a3c4e9b49e4fc595fb7e5f723159ba73a9426e7",
    "0x1a9836f6dcc253332ee707bd9808ab3d79d973d5",
    "0xde6b2a06407575b98724818445178c1f5fd53361",
    "0x67bcd41adbf12d1ecffd86e17af2b14179b556a3",
    "0x01adb5a14196d302004e3a1970a8bb3183dd2565",
    "0xdb16bb1e9208c46fa0cd1d64fd290d017958f476",
    "0x68feb25d10725ee055718305e89802478d1a661b",
    "0xb62183a0ede18e32c21b0edab1fd89966c715741",
    "0xdb6cfd521627b5ee14e7835e91d19dc197308da9",
    "0x50dcda64827095b710656dbb58867105ea1c72ac",
    "0x1cc221d84a0c1621ad6b462a84d1bd69c5b94a58",
    "0x58a9bba29d0201f5e285226792386c78e94f1c27",
    "0x1de5366615bceb1bdb7274536bf3fc9f06aa9c2c",
    "0x5eaaa37b6e8fa18e473d278edc0b303e585be281",
    "0x8cfa7c6fedc4dfec18eba1aa09138147f4cd3842",
    "0x0a009741192aa0bffe53b376e000ce7435f00012",
    "0x0a02aa6db3d88e73433c789ddcf375c3434ccc6d",
    "0x0320e2787d5c62a4a81f219dfb3c5abdf6265362",
    "0x9824697f7c12cabada9b57842060931c48dea969",
    "0xc5bfa9118ac642f7a6eaae72e60eb648187fa261",
    "0xf654cbd0d7b1765091b035bbb0205dd4b6b49c7f",
    "0x90c0bf8d71369d21f8addf0da33d21dcb0b1c384",
    "0xcc7573e077ab5705aa9f434b7c2bf9f3b0c64f25",
    "0xa67b426eb6de4c24ecb3f778ed3f9c09ae0699cb",
    "0x30e64da375369b02174ef8bf836713796f67fb9f",
    "0xfc15e66139c43f71262aa0bb28b07808d85a083d",
    "0xc0e3749d1d7a90588bff346dd075943234450868",
    "0x95572b4aecb6a381cfd0ec9d1162ac5cb8611151",
    "0xd075ca0b40d67db2570ae23936baeb64449dc8ba",
    "0x39be632bfc5a74183ffe124c60e248138e496bc4",
    "0x36c4bd54d54dd898c242f5f634f5d0cef3be2a8a",
    "0x98b221a032f525a9fa2107182b06630e4a7aab89",
    "0x39fb69f58481458c5bdf8b141d11157937ffcf14",
    "0x0ffeb87106910eefc69c1902f411b431ffc424ff",
    "0x91746d6f9df58b9807a5bb0e54e4ea86600c2dba",
    "0x8c0fcf914e90ff5d7f2d02c1576bf4245fad2b7f",
    "0xa897585ca534cd1db06c7656d047a2d4c56a3e1c",
    "0x7b604c0595612344a9c62e09e2fb098ff8f22efb",
    "0xafe1e2b350b3c9c8540634cda1e7e91f2f7a8458",
    "0xc918f7496689e60a5f42dd14b75486aee87f184e",
    "0xa6fbeaac65de6d6fc900d95932d9320aad9128f0",
    "0x159fa18b343dba8ba19b90f92ae711b971e05866",
    "0x5789a38a3facfaa86ed950e88d79a9a2f6140052",
    "0x4127143a866bf5d8ad2afb6de8e63164b8ad5bf6",
    "0xc0944d70a81e84a80dbcafce34cd662a4d894587",
    "0x3f7c10cbbb1ea1046a80b738b9eaf3217410c7f6",
    "0x1724e18fca576e0720692df03ace7d97443f52bd",
    "0xc89c3f23994a90491972bf98a57e5ed25bbf632d",
    "0x0e61dae710688c22d8f6d0c3fdd1735d27ddff8f",
    "0x2bfe66759f0331066f3e7d57b3dc9a96bfc17927",
    "0xe894575004113373d68535ee8e0b7e880278dcf9",
    "0xe357b511804f52e5ad27e8a8e09f4884e893bf99",
    "0x9cbf099ff424979439dfba03f00b5961784c06ce",
    "0xb6e0928537289164cb0d11969cf7b9fcd2c9982a",
    "0xf8d921bd839381e935164ce266c4ec1e75a5e9fa",
    "0x30c56911f3b7914d815db0b4fc2aeaf509eccb8f",
    "0x0e66cf7a7e7a7f4574670f6c2c9d463e1478a06c",
    "0x8581def657860bf58a5b0d6d2d357b51b81655b6",
    "0x894d774a293f8aa3d23d67815d4cadb5319c1094",
    "0x4a32007040567190bed4fa6ff3f5a03c0d47c9d7",
    "0xf7626459234e9249808a06aa08dc6b67c8e0a2fc",
    "0xaa62cf7caaf0c7e50deaa9d5d0b907472f00b258",
    "0xd8aca8644358d79a4cd132ce5cf72611856a26c9",
    "0x82d24ef70c3f44c9ac870910557eee04e3116a26",
    "0xa14f6577746f9fdc4aaba510796e4d617350ebe6",
    "0xd406251f6fc0ec1c4db8743572818ff12001305b",
    "0x452a8281853e412eaf9538826f48de00e166408e",
    "0x4a5e7e97a7374bc9e802c19a599c16c0af077aa3",
    "0xe8c1f5d81db3941eec16553fbda5a6fb2eca9d15",
    "0xb1d66938b23339bfdf25ef75dab3e6798eb54169",
    "0x763c823e2bdd66538c85736b1784031fa4d993f6",
    "0xeb8f7b8c27732e00bef318441422000d8ccd1e54",
    "0x65da0970b9a0153db222056b50a84a46d8cf40b5",
    "0x03a46b7990ac95f5119caecd5178fc85beddcd2a",
    "0x965b30b56f8a00a5c5a4c0c6e32592546374ae6e",
    "0x83a59ce2ef545c019e77c542552ec0f0f58402b6",
    "0xf8e245acddb070bdfcd8852db06eebbabea0b772",
    "0xebb94dfc47595763ebd990b8109392d42e02d61b",
    "0x4196c40de33062ce03070f058922baa99b28157b",
    "0x5de64f9503064344db3202d95ceb73c420dccd57",
    "0x7902d79ada34e3cb32a3faa5496334a004589925",
    "0x790c9422839fd93a3a4e31e531f96cc87f397c00",
    "0x42c8e43048f6ff3586945a1fd23e0bec540dcd07",
    "0xab92fca834aac2afe16cf6a2fc60cc7a864a77a5",
    "0x63503af6c43d949d9fa6c1b13f38a149e040a39e",
    "0x0301e6c63f3b9cf869e77996e287ca217c6b5521",
    "0xf8587bfb4d3e0b31029efa09d595ee6179ddfeaa",
    "0x702a39a9d7d84c6b269efaa024dff4037499bba9",
    "0x4d17676309cb16fa991e6ae43181d08203b781f8",
    "0x7c7770d9c77899325d57b41880df70c82bb685c2",
    "0x935ad0fbea9572bb24138f23a69e314f0bdbddbe",
    "0x6286b9f080d27f860f6b4bb0226f8ef06cc9f2fc",
    "0x9df8dd68c73b096cd9c0c4963fe89613df40a1cf",
    "0x3f3b9b0f14def5817a61437ccb25ccbbd4853ffd",
    "0xd14f076044414c255d2e82cceb1cb00fb1bba64c",
    "0xb8ed7db77a9cb01a79e16c9d72bb1dafb2f75efc",
    "0xa19085a92de036d782d955555d1b35b239992731",
    "0xedcdf2e84f2a6ba94b557b03bdfb7d10eca5aa50",
    "0xdfad3e4f73448f5c066ddb4dd5dfa4e60e4a4cba",
    "0x15ae76920e6c3570e13e443677a0503e6e95bf79",
    "0xcd8541b29f6667454f517cfd4372a6e210856757",
    "0x0dec3b9c60b3dc0d8a1a45547626dd2e5a509312",
    "0xcdd7152eee446ed547d8e8f19f2d83cf94d4c235",
    "0x3670e1bf4f566e1e73e9b575ad0b7d6761df9343",
    "0x0773ba87a7e1df71c547ee75b1fea7cd9749e619",
    "0x4e516eed9931f0ec00bbd92a2441ca75e23d567b",
    "0x36116cf77f80a76136591594d202047b2240c3ac",
    "0x39c66b35a98e82968944d2e43b39050e56c6448e",
    "0xd4f24489c090f2d5f31a3e80a65e69e6807e1749",
    "0x8a2c9ed8f6b9ad09036cc0f5aacae7e6708f3d0c",
    "0xc76f39917e38426515ed15376e0b518574e67f05",
    "0x731cf08ca9442b1e59080c41002f15ceb32fd8eb",
    "0xe34bb624055b171d777eccbbfc3baaeeffbe432c",
    "0x8e7f30e5cf6bfc2ca2e54bbf96a6d866fc03ff60",
    "0xd609a9c4c6bc2f9640036487d2a42f783dbb7cac",
    "0x3cd361345df2a61d2fa0e2d1692da4404f1a4a11",
    "0x5fc9f68333645f713a13f3b3fb9a0f3dedf0f8a7",
    "0xbdfa4f4492dd7b7cf211209c4791af8d52bf5c50",
    "0x7634049875381b273abf264e1eed5ba164b44281",
    "0x109f30842cdd088349f560b8053e124b79685774",
    "0xeab23c1e3776fad145e2e3dc56bcf739f6e0a393",
    "0xab42892e5ecdf640e037af5e24e4a895b34ef1d2",
    "0x0034e8411d397c7377c06995565e61846d9af957",
    "0xcf3c96b0f299208b085fd3746ffb9a6fe5482523",
    "0xa98fcd5de486fdc119a9f2a8d1f6ef65bdfb9eee",
    "0x0617d1ca9762876fd56034e7c5917ab659f6f63c",
    "0xacfaca2c6108838d3c8693371d07de051f8936c7",
    "0xa93ff96a6c23dba3d80b58167847ac765551e5ab",
    "0x81c5410c290786bdc40c3b921f60d65dc740fb62",
    "0x6b777e7f18d2a55db5fbfb13009d36b3a7ea04b3",
    "0xfb2f971120843ccce44e5806dbb947a9506bccef",
    "0x79eced3b348363c6548182fa753e0678a441b943",
    "0xf7cfb2765b8b84ca4f7c57196265bfab9b03f706",
    "0x00085a6b85b15e7a6bc9f4f4e937ba1709d5fc57",
    "0x64709afad07004beb53d76ff26c5549a84f3a583",
    "0x6c1755a70b08ea923a4bf2ad0ba336c435eea444",
    "0x576db81a12ec79e5d02aa5a3a81a6430b8ab6d5a",
    "0xb619279606fd1928f1075cf03f63e63697a697fa",
    "0x8266c20cb25a5e1425cb126d78799b2a138b6c46",
    "0x7efd0b4bf3ab62a6fecd0ad7e370a0938f90d3bb",
    "0x02c6d6d72a9fab5ba2e5c14aa9bfe31d4188528c",
    "0xfe6edbdbf3e4244a5de813951c30174b4f8932dc",
    "0xa6473cce13f11614745e6bf9cad704646616a9b8",
    "0x7568c4e22b8b4a069330537d2e51ec99754e0a39",
    "0xee23f4bc1671d048a8e592aabd0b2be497bcb5c2",
    "0xca5871968029672982d3dc52fd561b0fb3b33d77",
    "0xc4063c563e18571af228d0c5f93b092b51708fed",
    "0xb57aae22f8ce7524cae1704dcc68efdedf1a4b8d",
    "0x0ca4c4effedb86c34348ef7c943a84599cd6138f",
    "0xac963e5730ffed43ccf3465a6e50a1a6ad17193f",
    "0xd5ed0dc20bafc45e9b7c18b310934def3cfdf723",
    "0x423b634bd967531be48db364f760da815d3cd98e",
    "0xcb0190c6ae615755c2353316399bab2e43a0a05e",
    "0x5690deab36d1961e94baf298b49f1e8bf8f534af",
    "0x8139fdbcd3edda1fb842b198af56807f74541b40",
    "0x63e150989362ecc8b5debad0931f278264d5f47d",
    "0x30b0b72b6177ecadc9dd16831736801763f56c57",
    "0x1d4fbe5f17c4ac33d7ffe3a3445b6ce20f20c6a5",
    "0x52131aeaf3c6f0d59d81cc00ed5436c1c686a174",
    "0x33938097b1d655761eab28ed7dc8bc8a657267b9",
    "0x86c4cf9ba55f9e34d2079c3a5a8f7f41686806a8",
    "0x5d84faa5eb94109a7ffe0d12048643f649959210",
    "0x82f0845e723d957de8eba695d470946149172a3b",
    "0x88529f6aa7f030c87a0cbefec7316205be1b94e5",
    "0x8fb7233f027634424c550724d05d98dbbe34f6cc",
    "0x86b17329062b711117643635d0a332b85ff830db",
    "0xfcc1b0aaeb2b9063ab34fdfbb3eedc2ff30ae4f2",
    "0x7e0708a179b9c6a7fa6720d2d936c4a0f2eeac18",
    "0x3b96bfd9af962fa44b8393a916631590592ac146",
    "0x61ad1dc18522ee3d951129a9ee12790ba9e52058",
    "0x58a2e02265faa311528f67e52c0752ce396caf87",
    "0x3437d6c6e251b18852ac520e5e3b6552f12877ec",
    "0x0e8a3f452acfb7c7bcdc70505e7853987d2886d7",
    "0x8e9f6684b8b9c10cfbc76d08df5b45cd2d2debce",
    "0x3a3b0e7a69e88b4e4ee1d020339b00ff670813aa",
    "0xebaec6680be6449d38a150f444b852b39f28816c",
    "0x078e32dacb6b5b6b6496d7dcd054dec5b67ac2a1",
    "0x7558c2830bd9fcbbe8c54a08e47fc1ab94ef9552",
    "0xb0898b883de7f7f49ab8622f2185f5d0ca25b2ad",
    "0x856565db827588a88780454863f98a4a323e13aa",
    "0xd3b5a874b3376d12fea0690db391ac6e167156ed",
    "0xc956ca6e8fa34a5e86b54c55b0da4aa9f3eeedce",
    "0x7fccd22712c2e593de30a9806d3b72b2ad9eab15",
    "0x343a6aed149f6412500b6f6bedbe85f3dd23ba91",
    "0xe13fc24a44699d250557fbd7f29875d3db17c2c5",
    "0x8832924854e3cedb0a6abf372e6ccff9f7654332",
    "0xa2dcba7068d62bf5389bcd1a11cab502a2d3bca8",
    "0xd8abe3e16c7bd880e2235ebf66bdf17db9d1cbce",
    "0x184eaffa0e30f47e051a98e5bad0a4211e382b1a",
    "0x2fe79f33d373565feeac730d011ae758b0b367be",
    "0xb587526953ad321c1ab2ea26f7311d2aa1a98a4a",
    "0x9a7332fabf273e403249a8380215df1a382f9937",
    "0x63a56ccb802cb6193e819bf5f37876e7345fece9",
    "0xdb88ab5b485b38edbeef866314f9e49d095bce39",
    "0x0476f3ee277eb20568ee2369b337f3ce55bc558a",
    "0x3a699c8a26dea3b661592f126c1733cf1ca4f79b",
    "0x81846a1c84bf701ade154673f494616df01fb59b",
    "0xb48cffa08bd5abd62bb0f3d373e5079177f8f66a",
    "0x97420a978e3a35a7f678b8c59ceb8bb6a024ddc8",
    "0x8ad7f2e3cf0a2240661df767546d30ca9997718a",
    "0x460b60565cb73845d56564384ab84bf84c13e47d",
    "0xa39ba2cd8658d0b69ba1880dcfbb65216ab33056",
    "0x5334c40ae5488130fbda5ce4b39801fbc540a2f3",
    "0xb89b8702deac50254d002225b61286bc622d741e",
    "0x10a1ddb397051d4cfa7dabe04c865b823008008e",
    "0x070657fbd7111bb23ca7df96f795b75075a2a08e",
    "0x4eae32085f38bea93ebca10eabe8a3c59a05cb58",
    "0xca89af14e0f28aa4edcc61a7486d4379b32e5c4d",
    "0x3b2ec8250c8a0446cc4eb9b2dd1b3ad654dfc0e7",
    "0x9045c2d6453a94eb8a6459e974eef9906b9566b4",
    "0xef36bce4d66927eb3009a8afd9b3027f1f3d8065",
    "0xaf0af5a4a7b3e26359696ebc3d40cdb98f832376",
    "0x1acace246a6faf59a35a6f69454ff8326a82f880",
    "0xf02832df8ae28dd02a0092d367b42134635c01ac",
    "0x7fa57d19b5c60a8ada62929fd21bceac0689851a",
    "0x4f94bfaf745a8f9638fcc820181fb71eebd08895",
    "0x355e03d40211cc6b6d18ce52278e91566ff29839",
    "0x0fd9487d84323342064f357918f1b43c828c404d",
    "0xe11e914259d125bdd1bdef47f7c0397ceb2ad9ba",
    "0xbd4a00764217c13a246f86db58d74541a0c3972a",
    "0x0199a54ad38f4d55b3819517d3fea232ae33f673",
    "0xb54d4630b0318fb1bd70750b5ed62333b04c8e4a",
    "0x364d42c459dab67e29e3ed8df1f2c5c17f59b35b",
    "0x7b8886eb1ed2e2add1ae600630ae8c814c2bd405",
    "0xc1bd49fcdf54aeb8e9c71f2811787f1298926b16",
    "0x07403dc18592e7efdc358bff4becc60ac829dc0c",
    "0xcf49016db07e94e541097c5aac91e2d88243f313",
    "0xdfe879df0aaec5b16f9feb277c33d34b9eafb72a",
    "0x7f67f6a09bcb2159b094b64b4acc53d5193aea2e",
    "0xa88bc9d5129b83be2c6f1282eda55058f6e32ad4",
    "0x78e96be52e38b3fc3445a2ed34a6e586ffab9631",
    "0xef001a0d62d43ccab7ac9c461f538e707a9edbf2",
    "0x99e2ae3dd7fdb5684950176551911d19d55dfcab",
    "0x3b69035f18e923ad2144f775a6156931f9b15d2d",
    "0xbebcf4b70935f029697f39f66f4e5cea315128c3",
    "0x1f244e040713b4139b4d98890db0d2d7d6468de4",
    "0x92d78e32b990d10aeca0875dc5585f1a6f958179",
    "0x3f3429d28438cc14133966820b8a9ea61cf1d4f0",
    "0x7ba7f4773fa7890bad57879f0a1faa0edffb3520",
    "0xcb80d4526d03ba363224515577ce1a81490e0729",
    "0x06e4cb4f3ba9a2916b6384acbdeaa74daaf91550",
    "0xd262b944e2effca0855c43023d3f1843b0ee6fb1",
    "0xabbd5b2b0b034781e58434736728b9d0673de7f1",
    "0xedcdf2e84f2a6ba94b557b03bdfb7d10eca5aa50",
    "0xe52fd453324fbadaf72d5256c01158cd5cf5e996",
    "0xee2826453a4fd5afeb7ceffeef3ffa2320081268",
    "0x01d1f55d94a53a9517c07f793f35320faa0d2dcf",
    "0xbcd420d13362532756c968f663f96ba95e240dd2",
    "0x8cc2af700d686e7e21135681511992c972dbd8ea",
    "0x1cd14801537a3d1550b7e30a9ed59bf68d8cbc84",
    "0x1c68c78dc8ac8b73f418b379930e39578447a042",
    "0xa507b355d6288a232ac692dad36af80ff1eba062",
    "0x588b530e0d6d5c15afd56012434752296d70b36b",
    "0x0b5a6a15b975fd35f0b301748c8dabd35b50d8c5",
    "0x36c4bd54d54dd898c242f5f634f5d0cef3be2a8a",
    "0xdd393504cb25e1c6c3e2b1bd0d642967c3ba31a4",
    "0x957ffde35b2d84f01d9bcaeb7528a2bcc268b9c1",
    "0x1eab3b222a5b57474e0c237e7e1c4312c1066855",
    "0x47ab2ba28c381011fa1f25417c4c2b2c0d5b4781",
    "0x5d3f81ad171616571bf3119a3120e392b914fd7c",
    "0xf368d43f148e1803ec793670183b0ca6a07d3898",
    "0x98e711f31e49c2e50c1a290b6f2b1e493e43ea76",
    "0x94cb486eb43ba23159a7debac920b0fa7cb476fa",
    "0x41339d9825963515e5705df8d3b0ea98105ebb1c",
    "0x10124bda2119db4802905a889c0d46a0c4af26ea",
    "0x67e254c61b3fc5f5ed92f3004063b21cd0b46b6b",
    "0x3846e7a1a5dea3f43104ed89ff0e6ffd1cc74b6e",
    "0x13939d994b1a27753de29adddb56d175e846608b",
    "0x1f9bb27d0c66feb932f3f8b02620a128d072f3d8",
    "0x755f60a301e070d09137bc4cff0cbeabf5722ae6",
    "0xe466d6cf6e2c3f3f8345d39633d4a968ec879bd5",
    "0x23c158e2c97e98a14efbe22167551f5212162fb5",
    "0x9c094c30a7d75346ff1c61c4f494a54fd2556793",
    "0x34bf8dcb3ed8cf8aab57b1d8330cab8ba5246708",
    "0x1749ad951fb612b42dc105944da86c362a783487",
    "0x1a8c730c2ad5faab9fe0d7ee5bfd750e044a111d",
    "0xe6395145c839dac68d4f4c006101f88614d359f0",
    "0x7a16ff8270133f063aab6c9977183d9e72835428",
  ];

  const address = addresses[getRandomInt(0, addresses.length)];

  const renderChildren = () =>
    Children.map(children, (child) =>
      cloneElement(child as ReactElement, {
        onClick: () => router.push(`?address=${address}`),
      })
    );

  return children ? (
    <span>{renderChildren()}</span>
  ) : (
    <Button onClick={() => router.push(`?address=${address}`)}>
      <Trans>Use Random Address</Trans>
    </Button>
  );
};

const ExperimentalAlert = () => {
  const [shouldDisplay, setShouldDisplay] = useState(true);

  if (!shouldDisplay) return null;

  return (
    <Alert
      mb={15}
      mt={45}
      icon={<FiAlertTriangle size="1rem" />}
      title={<Trans>Experimental!</Trans>}
      color="red"
      withCloseButton
      onClose={() => setShouldDisplay(false)}
      variant="outline"
      closeButtonLabel={t`Close alert`}
    >
      <Trans>
        This Aave debt simulator is experimental. Don't make financial decisions
        based solely on the results of this app.
      </Trans>
    </Alert>
  );
};
