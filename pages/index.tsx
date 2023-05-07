import {
  Alert,
  Button,
  Center,
  Container,
  Divider,
  Space,
  Text,
} from '@mantine/core';
import { FiAlertTriangle } from 'react-icons/fi';
import { useEffect, useState, Children, cloneElement, ReactChild, ReactElement } from 'react';
import { NextRouter, useRouter } from 'next/router';
import { ethers } from 'ethers';
import { useAaveData } from '../hooks/useAaveData';
import AppBar from '../components/AppBar';
import AddressInput, { isValidENSAddress } from '../components/AddressInput';
import AddressCard, { HealthFactorSkeleton } from '../components/AddressCard';
import Footer from '../components/Footer';

export default function HomePage() {
  const router: NextRouter = useRouter();
  const address = router?.query?.address as string;
  const isValidAddress: boolean = ethers.utils.isAddress(address) || isValidENSAddress(address);
  const { currentAddress, setCurrentAddress } = useAaveData(isValidAddress ? address : '');

  useEffect(() => {
    if (!address && currentAddress) {
      setCurrentAddress('');
    }
    if (router.query.address && router.query.address !== currentAddress) {
      if (isValidAddress) {
        setCurrentAddress(address);
      }
    }
  }, [address]);

  return (
    <Container px="xs" style={{ contain: 'paint' }}>
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
          Paste an address with an Aave debt position in the box above to visualize how changes to borrow/reserve assets
          affect the position's health factor and borrowing power.
        </Text>
      </Center>

      <Divider
        my="sm"
        variant="dashed"
        labelPosition="center"
        label="OR"
      />

      <Center mt={15}>
        <Text fz="md" ta="center">Want to go for a quick spin?</Text>
      </Center>

      <Space h="md" />

      <Center>
        <RandomAddressButton />
        <Space w="xl" />
        <Divider orientation="vertical" />
        <Space w="xl" />
        <Button onClick={() => router.push("?address=sandbox.eth")}>Build Position from Scratch</Button>
      </Center>
    </>

  )
}


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
    '0xb5f089f77328061af7332c435b3b8d9aa772a408',
    '0xb5f2535871eb511ffd48bfb8514ddff0f47b7712',
    '0xb66240325d6e322803e73f2c18c8d8a3bff31ab3',
    '0xb6c02ea3555b053f822d673436783863b87e2709',
    '0xb71cd9f221b834508eb8dc136e48125743a3db2f',
    '0xb74c28f8aa7f55bdca7d0aa5103aaed455a76e3d',
    '0xb7a3c4b0889c48f325a197ada1c6b94a86f70687',
    '0xb7bb658298a51f8aed39af93f4aaa0ef5e003da5',
    '0xb83483d4672f6c16dbda6b66eccbb77b7ca769e4',
    '0xb845d3c82853b362adf47a045c087d52384a7776',
    '0xb84cda4f92aa1e38bf7ff4500a22725647124ba3',
    '0xb8c53fdb2ed1ef8a7107918bd4b22ee1e07e3841',
    '0xb8dbb24a0f27c8a3c26f94ee908f7cd5e47dc819',
    '0xb8dd0233640c8137d89e2a86ecd3b725ceca148d',
    '0xb8ec7c6483444572a486e22dd8f875bb26e14472',
    '0xb924d025768dff60772bf5c797273aedd511fdd7',
    '0xb935bd023b31608a881a31fc522f4d488a8e597a',
    '0xb9594cd2405868a44d07bcf1dfad38b9fa490e53',
    '0xb9a8f6204f08df3609afc4a0a352a1e62c8b8c5d',
    '0xb9d343976885e92b73aa313e195e5716f5c2086b',
    '0xba5b5cc341d71e0c2c07b65bb99586dc558d2138',
    '0xbb27900feda0d6c2d002f1249203c16d6de7a8e4',
    '0xbb9103261ddab65ab6c737d29cececf4b4172de9',
    '0xbc1c1f0ccda9165eb16226d9dee352b46424dd6a',
    '0xbcb2b01c11b6d7702a7b36e8b107f51c47bf8061',
    '0xbd1319be8b267d868282aa221a7a68f9afa65da6',
    '0xbd7fc37c1bf5cec9eeee9fd9729dd8f3da86d8e7',
    '0xbe08e519eda8abd2c2e3d69051ba9eb246848f71',
    '0xbe0d364be872a1b5ceb8be5f1c1e7e651810cee5',
    '0xbe12c7a5f0affe151a2b39bf1503efded2ddf9bb',
    '0xbe3ae37271685e8b5b7188e3c83d0449da9fc409',
    '0xbea7fb076d2fb27d1df55a66b8d288eb8f37bae0',
    '0xbeff7fd09302aa95e853267add6119e1bb4303cc',
    '0xbf16e9b0aaddef8ea03ba2c599a9ebf287277391',
    '0xbfd733f1502da77b3b249257e52deaa897543824',
    '0xbfe5b0e014fac1ceca10cbef13068b8f8ffe3706',
    '0xc0944d70a81e84a80dbcafce34cd662a4d894587',
    '0xc1316be5a1e5f3fff862deb81f5e988c4fab4ebf',
    '0xc1922062b2599f7319bf9076b71f924e38ee7818',
    '0xc1e17e6572bc0bb8a9dd8f8515b51a51c60fcbaa',
    '0xc2f590e3e340ae550324a256f3c3489ad7e65541',
    '0xc2f72e41b5c8336abe0cb4634b0dc790d7ade0d8',
    '0xc37d54a252ccb170f2c64680932c42c6361c5a77',
    '0xc3808893a7d04d0832911ce7bce09c07f198688a',
    '0xc3ee6ddf545e31c68c9a6299098b51fe4db52cd6',
    '0xc41128ddfe93d403b7fe4e72eb6a429d1379cd90',
    '0xc4ac38dc5d4f58170d9a7183f7c368cbc97264db',
    '0xc4bbcf77ba6ff04eb9297cd8c5edb56060d87d0b',
    '0xc4dd018f8c281bd4a7df9777546d1c0fde3826f9',
    '0xc4dfeab825a88e78b9bc2192419995ce620fe5fd',
    '0xc54c27d2588fe79aa26758a9d25a1a03165f6ab5',
    '0xc65d38e9735aa6f39b5f28cf26ecad236c10de6b',
    '0xc67d97f5b97ba8273acac040eb76bd2a2fe5554f',
    '0xc67db183b44e3c6be81c4adea1faaf8fe6a53260',
    '0xc72c8103af2045e4da1633a0a23234b5de5deaab',
    '0xc76f39917e38426515ed15376e0b518574e67f05',
    '0xc7b4c494461e3c1f7d813aeecd0864e6a993ae06',
    '0xc7c942557d2a531ad8d52a1a2701a56ef2f3f2ae',
    '0xc7f82452755dfdb32e5a3e78844f8912cb022df1',
    '0xc86176da1ae818281f8bfc5afa03f9a092aa20a0',
    '0xc8834af56ab1890489adbc93c81987d3cc9a43f3',
    '0xc8af2b9307bede3f0931d191679123cea5d685ef',
    '0xc935b59c7f810cec91e46b45f03a4ac4cc0e915e',
    '0xc942c4230991c8c5238ac05dba44202df32ef323',
    '0xc958b32ba6bc0dcaab9a56e3195f1c4e10922d43',
    '0xc9f7029943f362ea17f6b00843d6b2cbb7c21f7e',
    '0xc9facd92ba8c20e3fe03cdb13cccdb8cc950fdaf',
    '0xca0f46f9f8a2cf84d9cc11e644c9f982bd0b80e8',
    '0xca216800bb9c5dc0b101cb693fd9240be3efa1de',
    '0xca545636eeee744824e444ac162aff848c26bad7',
    '0xcadad1c653352329cecc1c2df2580874cc658958',
    '0xcb528700b3a599111d30f96aa2251ddc7fc37e61',
    '0xcb7da2cda654b29fba272da622ac96cbf1ea59b5',
    '0xcbaf8997219fa1272af4f5a9c1cb4e7d57020ed0',
    '0xccc3171b1e9bac640c633969b374a2bd2b55619f',
    '0xccdd062202b739037cb3023c14809c243905b8cc',
    '0xcce3ada5314481db76709fa69a67166e9434a3b3',
    '0xccf0e1fc608f52ec6a9098c9430892219261a93b',
    '0xcd262b16421ac23d13d345e4e08875374d5235bf',
    '0xcdddb82ae099be41d645d9dcbd5fcf4d3a3da0e0',
    '0xce62148a0bce38374daf79b746672d72fb8e8927',
    '0xce9f12b58f4f48419e31436455c4a8aa61376274',
    '0xcf3c96b0f299208b085fd3746ffb9a6fe5482523',
    '0xcf63e1c31805254b6fb3ed7829206c2b2505e3a7',
    '0xcffabd8aa79802c96244d2d46245a91b9273dd91',
    '0xd1390b1434015795889b68d9bf5c628a4feec6c1',
    '0xd14f076044414c255d2e82cceb1cb00fb1bba64c',
    '0xd18236cd213f39d078177b6f6908f0e44e88e4aa',
    '0xd1df0ab390a0587ed5283bf5780b3e0131789ce8',
    '0xd235731c60695234c1acd4f5129a143a1703b593',
    '0xd28a1b3a9c3b6843beba49e322fdc0fa2ff6cea6',
    '0xd2c69cd5d740bc735eb30188d3b406e2774a1d21',
    '0xd385c94815bca3c58dc32f03bd0c3d61bd8dcbf0',
    '0xd412f70d256d7b4bfb19a4d068c76dbaa4325674',
    '0xd4ac89483776351f3ac7147f0ce7434333754c58',
    '0xd4d18a29df9c4e6679af7ad5c7bdb6ea36a14c2a',
    '0xd4eba87a81942a82ced7ed51ff60d9fc803ef4db',
    '0xd4f24489c090f2d5f31a3e80a65e69e6807e1749',
    '0xd50cd861034c156d002612ad5451f3d2962f8cc1',
    '0xd551dcee9a418049f4aeecf764801ee4101ed2a8',
    '0xd5a19c4eb8412dfcf25970566739d84c2e592daa',
    '0xd5ae28f9387de2ad89d146b4f327c8cd1f2bf5cd',
    '0xd5af18ff1478640f8a6cdd06bf6cb7384b729f61',
    '0xd6fd705ee0b31a9300d3e2154bcce777270cbb6f',
    '0xd777efcbf5c834acbd8857023bb75b3ba48786f4',
    '0xd7813351f9db3c79af993883c86076d76ae98c0d',
    '0xd821f22d7dc1f8fa811400caa3c03f74b144e23c',
    '0xd834839da5f1a49404270b231163a8fd1df1f94c',
    '0xd8f6398d1d8abc9adfede2f8d8c0fb641d9e4734',
    '0xd91e38f00bcd51311b88f801ab3e6cacaa849158',
    '0xd95ac6954c937639a19b10c63ab5845877449f2a',
    '0xd97bc5744409be075c4fedf285eec3b1a557325e',
    '0xd982cdb21482d4fe25b03fbb35f0e7b682c6f67d',
    '0xd9861c59272cd7c5254bc76da433ab7feff02770',
    '0xd9b415a727c9506b2487788d7693dee5e5cd7677',
    '0xd9bfce3f89430be5ac2cd81c962e04b66c890c0d',
    '0xda50b582a639fee42ea7ca86fd9183a2d435ae22',
    '0xda54a42d6f6552e02af2b7bf7e84a44217a6046d',
    '0xdac752245d44f396630c84394e5db9b5de6614dd',
    '0xdb19c47e87ed3ff37425a99b9dee1f4920f755b9',
    '0xdb4d019def46c8009e78b81d08f8ae2389f239c8',
    '0xdb77fe908933a740549b92a8660d5a445050c895',
    '0xdbb9c6376486b8f7a8a8f4a2d5ad5bf78a09a6a4',
    '0xdbc0b38a96f9e4c7a2172d3f01ad36a8a47e44aa',
    '0xdbc86e3493cd911b9b28d1cf8816e07de53389ec',
    '0xdc173293704f634879a3d4dfad53aedc244c6c3c',
    '0xdc3ed2238350aacb484aa6b0d17c4fc3353f0046',
    '0xdd0400a6bcea1ce4e5db6f4c0be4c226193672f2',
    '0xdd5a10909909991ff6f8875fdf79724508308e60',
    '0xdd5a74ee204b1563ba74630b8b3eb1fcd210783a',
    '0xdda102df16a2a70796583bbd7471e2f2bd5d47f8',
    '0xdda42babfa867443065e4fcaad2bc3a55f4e2dbe',
    '0xddad501519d5e2b45f4cf1c6a63cb9c518e39fdc',
    '0xddb78a939eb9ebcbeb77c19ec9e5de94c5395d94',
    '0xddd2fd15823a3efbe3796c1885abbcff70b4e40d',
    '0xde03ffafa4a0de3572f2f7475b929196b3ef6ca7',
    '0xde092a220313cede58750434b66d46b5ff494cbb',
    '0xde7a7476673753f90bc77e5c83e44a2db97faf67',
    '0xdea55c930dace53bd220b6992f24d11b51a63440',
    '0xdec094279bb40920f1d4d33e46e0162b4ca96b9c',
    '0xdedc3795bdc8364654e3d892cf56c7544cb593d4',
    '0xdf6ab555f39d21d9923632f978052db1595ae5a7',
    '0xdfad3e4f73448f5c066ddb4dd5dfa4e60e4a4cba',
    '0xdfb3bcd6169bc192d5e23d87b6f7a1171525b9d4',
    '0xdfbd51bda5a3edd4dc68c068dd8cfeb5bc431b92',
    '0xe006e905de2c1762fe90d216ef604f3e628465b4',
    '0xe01311a5820d36c0ae5ebf8f3eccc75dd333ece5',
    '0xe063dc804128bcfa468221bf7ceb69bf2728e937',
    '0xe073182d644ebb5290cfa6915ba94312fc73a679',
    '0xe11cf6c43913b3e33df5890676b17c3f0e49cf6f',
    '0xe13cec7b2c10574e5e89a780582b66d2c3c71b80',
    '0xe19f57d6935ccc76549b436085783d796272beb0',
    '0xe1c23a613fa6a6a8478774bc321a88da7b2b3c90',
    '0xe20bc163cd48f7e595bc1b2676fd070aa93066f6',
    '0xe2e508e3462fcf67979265a726995aade3553386',
    '0xe34bb624055b171d777eccbbfc3baaeeffbe432c',
    '0xe38194afa48b306362b6ca7f8ea270964e82690f',
    '0xe38383f28a5770bf8b304539248adda8d5f38248',
    '0xe38c63e23798b6894d98266e6ddbd0cbd5a6760a',
    '0xe4e7e0e55ca84b09319de671c6a6f5a843b96f43',
    '0xe53085d26544daf3ba8f66b2d1b108e285cc51f9',
    '0xe5350e927b904fdb4d2af55c566e269bb3df1941',
    '0xe551388b683bb1e34e27e5a7b00eabe79b080bf7',
    '0xe583cd536425bf22c3736be4aa46116826142138',
    '0xe5aedd6520c4d4e0cb4ee78784a0187d34d55adc',
    '0xe5c0c893f318acbbb5ac5e5a28ec0fe609e711a0',
    '0xe630b16a6c270708f546086d64bcba69cec1f453',
    '0xe71996ab6ae8a06b43d28c8bbbca01765f023bfd',
    '0xe78a6ea0274d72fd45c50dc3ad650dd67527f90e',
    '0xe7c5ff8b017f48a2275a3f9f4f01a1e664cb81ee',
    '0xe80b7dd89d1cf4b709612dd9e045da93f33973f9',
    '0xe82e9f8376d5fc6f4076d0c7f1380964e648514b',
    '0xe897c705b23e63321cc7e9546dae106eb2c123e1',
    '0xe8a6b24dac4f364af18f429fd6af978f2811b871',
    '0xe918ff4aa2cdbd159d44565a0fb065d7189eab00',
    '0xe923c5ca95e8b77018de5f25749174ea0e2a64a6',
    '0xe996afb92e2a6aabb3588c4bc13efc68ea95d512',
    '0xe9c57881747a62ebf5affbce5fff85842df07dbe',
    '0xea0eea31d168196ce611a947ea05f19a00c7fe05',
    '0xea58a11fec6ffc420819d05ffad6c6f1a60a41a1',
    '0xeab23c1e3776fad145e2e3dc56bcf739f6e0a393',
    '0xeaba588d42d7f13048bd5795372530ac98cbd34f',
    '0xeac4078c050074dc668117385ac014960e1e0bcf',
    '0xeb00ce77c4d4b32c836dbb76156002a7da79c2f0',
    '0xeb2109a191f3b552a38286781b501cf16fb1b6b8',
    '0xeb350d4315fa5332a0efac7c2365ca2e414acabd',
    '0xebe7a232b5855f8f4bfb89228bf4e981c509f127',
    '0xec36e9b03849e15a349f7d0e4362d16d0f2a526c',
    '0xed222d72c2df009edbc5e61fd726448cb6e48117',
    '0xed2a097ad80eeef587796709593c4fdde1e30eef',
    '0xed5d4aa57e28689050eb7de9975d79e0b254f4a0',
    '0xeda61b1e9f414889dde0dbe83b3bacf814a98e87',
    '0xedaf58a4a3ee38b3ea6b4462278555fbabc6b361',
    '0xedcdf2e84f2a6ba94b557b03bdfb7d10eca5aa50',
    '0xedd19bb3885252f9c0768dc04f3e90f6fe378bcc',
    '0xedf63ac2bfcffcf2b4c9d4a85654dd85aa1def74',
    '0xee57e4fff9ee53bec80c32200b83cfce23a68378',
    '0xee8c04704fbecc4aee5014cd625ba68c31902b16',
    '0xee9d6fbdb19ef232fdff03fa7a7c3054745117b8',
    '0xef4a39848e36008c23d71f76b6f7fd8c329b3267',
    '0xefef171df3d8864c2d8705768096fd5a0eb2b247',
    '0xeffcbe1768341a773d65b26ea804cd1b0aac1e3a',
    '0xf01c88bbbc3823e1ab805aeda40c55e18f3b6428',
    '0xf051de7308cb07b6fcbdfa697dd4943cf584182f',
    '0xf0ae24046492af6e544418ff0e5a9ae61d3824de',
    '0xf0b1966e33fdac9350491c24c0c5d7a8f11bf06a',
    '0xf127ea3435991ef10cb6be24c41ffe68f927c032',
    '0xf218db2505b13fdcbab1d971f57c2692e0181dc1',
    '0xf24530d32698787bbac318e30258e84aa880d93b',
    '0xf24b73a328df29cdde804acf605b8722ad5030da',
    '0xf257344b691ca206b9cf60c6d0b87e28d1c87422',
    '0xf27e4ebda7b140722b0eb0f4564729c3e8b16e6d',
    '0xf295fcf300f177b8bc57b044b2995a5327f59891',
    '0xf2c48e88f7eea738748224f690b8ff131ccf724b',
    '0xf2e2e8cf79d2976062b3766caabe9fbb15a9c264',
    '0xf31cbe33b9618c00b207c0e088f4f260edaab1ea',
    '0xf37c0fc8affd0acae13b27de0432b7c41e734a51',
    '0xf38c5c71cf44dcdd0a3d5c8513aa8d1e8e4c3c05',
    '0xf40404fdfebd54f03c7495ed71a0a96bd2dc8d93',
    '0xf46e701ab53e18d270fb2c472f2eae275c01bddc',
    '0xf4b195ee08dc60ed1c60464e2be29f7511f2ec5c',
    '0xf4b1d9b61d903943ece873ef0d3ba1f2ea0c861d',
    '0xf52a01ba9a57a54f50bcd5ffc1924d897e47bc15',
    '0xf52e602be034b221d5d56aa544f2df71d92fe77d',
    '0xf574a16efbad28f2a74f55686bbfad3710a662a5',
    '0xf6261d145ec7676dc0e55424b679403f1ca89640',
    '0xf62871f369536ae3ff45d2bdfc3b89b4f0dcd812',
    '0xf67d9569af280e1f8c1aeb5377ae67659b4881d6',
    '0xf6ba1a0d29214822b18ab0feb527856832a34e93',
    '0xf6da9e9d73d7893223578d32a95d6d7de5522767',
    '0xf704d714ec68a378dfe0c24825932b9dd38d1ccc',
    '0xf791d2d64d926839bdfb3fa426c41d0ca014863b',
    '0xf7a29f9f8a326401535f03e4b75e1b91249d5408',
    '0xf888bceb2949198bd065eb8cf1603e268657a641',
    '0xf9210a26278df1fb6fd5ad9d71fc9cde9dc73e89',
    '0xf9320d1cf9f68f951c575f371ccc3d4ec83a7a8d',
    '0xf9869d4ba1260a47303ce5b34f27983475ce2160',
    '0xf9d853e88c4c964f68766a4f48ab277e43a99675',
    '0xfa2479b515686fd5241e97794414aebbfd982416',
    '0xfa51d98393ca70bfcdff555048790e2f00f1a958',
    '0xfa674c5ab2564c4de9e17631ebda41fee91710ec',
    '0xfa866c56267d949593311c70c08256d127b1de49',
    '0xfaa779cc3d28caa7a65ea57e172c19c2e60bb8d5',
    '0xfb0ba02380a269e331d18c68a3704d8a7ec54f88',
    '0xfb7e45a97f77005c750acf1ad0b104547dde4476',
    '0xfbea872f9f5adc532f0c7ed3aaff1974da043b82',
    '0xfc058ab3f45346fab9ed303a587dad583a4b84a8',
    '0xfd167fe0d68bc3810194a7d954565dfacb9beb81',
    '0xfd700870c05eea211401eaed0d9efb96f7ff3fea',
    '0xfd8a63085804dcb95417fe33f9e49253522c68dd',
    '0xfe067b753b7cbb95e5ee05e54932b1edd4301c77',
    '0xfe362ad59094313442ea0a175ba63a12c0855c99',
    '0xfea20dabbee51a0c7cbcd8ec8e0e769182fe6977',
  ];

  const address = addresses[getRandomInt(0, addresses.length)];

  const renderChildren = () => Children.map(children, (child) => cloneElement(child as ReactElement, {
    onClick: () => router.push(`?address=${address}`),
  }));

  return children ? (
    <span>{renderChildren()}</span>
  ) : (
    <Button onClick={() => router.push(`?address=${address}`)}>Use Random Aave Address</Button>
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
      title="Experimental!"
      color="red"
      withCloseButton
      onClose={() => setShouldDisplay(false)}
      variant="outline"
      closeButtonLabel="Close alert"
    >
      This CDP simulator is experimental and under active development. Don't make financial
      decisions based solely on the results of this app.
    </Alert>
  );
};
