import React, { useState, useEffect } from 'react'
import axios from 'axios';
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import NftCard from '../components/common/NftCard'
import { useHashConnect } from "../components/common/HashConnectAPIProvider";
import { getRequest, postRequest } from "../components/common/api/apiRequests";
import LoadingLayout from "../components/common/api/LoadingLayout"
import * as env from "../env";
import './staking.css'

const StakingPage = () => {
  const AUTHORIZATION_URL = `${env.DISCORD_OAUTH_AUTHORIZE_URL}?response_type=code&client_id=${env.CLIENT_ID}&scope=identify&prompt=consent`;

  const { walletData, installedExtensions, connect, disconnect } = useHashConnect();

  const [walletId, setWalletId] = useState(null)

  const [loadingView, setLoadingView] = useState(false);
  const [discordLoginFlag, setdiscordLoginFlag] = useState(false);

  // const [userDetails, setUserDetails] = useState(null);
  const [userDetails, setUserDetails] = useState({ username: "PhoenixDev", discriminator: "6938" });
  const [token, setToken] = useState(null);
  const [text, setText] = useState("You must connect your Discord")

  const [mirrorNodeNextLink, setMirrorNodeNextLink] = useState(null);
  const [walletNftList, setWalletNftList] = useState(null);

  useEffect(() => {
    if (walletData.pairingData != null) {
      console.log(walletData.pairingData.length)
      if (walletData.pairingData.length != 0) {
        if (walletData.pairingData.length == undefined) {
          setWalletId(walletData.pairingData.accountIds[0])
        }
        else {
          setWalletId(walletData.pairingData[0].accountIds[0])
        }
      }
    }
    else {
      console.log(null)
      setWalletId(null)
    }
  }, [walletData]);

  useEffect(() => {
    if (walletId != null) {
      if (discordLoginFlag == true)
        checkUser()
    }
  }, [walletId]);

  useEffect(() => {
    if (userDetails != null) {
      setdiscordLoginFlag(true);
      if (walletId != null)
        checkUser()
      else
        setText("You must connect HashPack Wallet");
    }
  }, [userDetails]);

  useEffect(() => {
    const urlSearchParams = new URLSearchParams(window.location.search);
    const params = Object.fromEntries(urlSearchParams.entries());
    if (!params.code) return;
    getInfo(params.code);
  }, []);

  const onClickDisconnectHashPack = () => {
    disconnect();
  }

  const onClickConnectHashPack = () => {
    if (installedExtensions) {
      connect();
    } else {
      alert(
        "Please install HashPack wallet extension first. from chrome web store."
      );
    }
  };

  const getInfo = async (code) => {
    //    const accessToken = token == null ? await getToken(code) : token;
    const accessToken = await getToken(code)
    await getUserInfo(accessToken)
  }

  const getUserInfo = async (accessToken) => {
    try {
      const response = await axios.get(env.DISCORD_OAUTH_USER_URL, {
        headers: {
          authorization: `${accessToken.token_type} ${accessToken.access_token}`
        }
      });
      setUserDetails(response.data);
      return response.data;
    } catch (error) {
      console.log(error);
    }
  }

  const getToken = async (code) => {
    try {
      const options = new URLSearchParams({
        'client_id': env.CLIENT_ID,
        'client_secret': env.CLIENT_SECRET,
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': env.REDIRECT_URL,
        scope: 'identify guilds',
      });
      const result = await axios.post(env.DISCORD_OAUTH_TOKEN_URL, options,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        },
      );
      setToken(result.data.access_token);
      return result.data;
    } catch (error) {
      console.log(error);
    }
  }

  const checkUser = async () => {
    setLoadingView(true)

    const _result = await getRequest(env.SERVER_URL + "/api/user/user_info?discordName=" + userDetails.username + "&discriminator=" + userDetails.discriminator + "&walletId=" + walletId)
    if (!_result) {
      toast.error("Something wrong with server!")
      setLoadingView(false)
      return
    }
    if (_result.result == false) {
      toast.error(_result.error)
      setLoadingView(false)
      return
    }

    // get nft list in wallet
    await getWalletNftData(_result.data);

    setLoadingView(false)
  }

  const getWalletNftData = async (stakedNftList_) => {
    let _newWalletNftInfo = [];
    let _WNinfo;
    let _nextLink = null;

    if (mirrorNodeNextLink === null)
      _WNinfo = await getRequest(env.MIRROR_NET_URL + "/api/v1/accounts/" + walletId + "/nfts");
    else
      _WNinfo = await getRequest(env.MIRROR_NET_URL + mirrorNodeNextLink);

    if (!_WNinfo) {
      toast.error("Something wrong with network!");
      setLoadingView(false);
      return;
    }

    if (_WNinfo.nfts && _WNinfo.nfts.length > 0)
      _nextLink = _WNinfo.links.next;

    while (1) {
      let _tempNftInfo = _WNinfo.nfts;
      console.log(_tempNftInfo)

      for (let i = 0; i < _tempNftInfo.length; i++) {
        if (_tempNftInfo[i].token_id == env.DERAGODS_NFT_ID) {
          let _nftInfoResponse = await getNftInfoFromMirrorNet(_tempNftInfo[i].token_id, _tempNftInfo[i].serial_number);

          if (_nftInfoResponse.result) {
            let _stakeStatus = "unstaked"
            let point_ = 0
            for (let j = 0; j < stakedNftList_.length; j++) {
              if (stakedNftList_[j].token_id == _tempNftInfo[i].token_id && parseInt(stakedNftList_[j].serial_number, 10) == _tempNftInfo[i].serial_number) {
                _stakeStatus = "staked"
                point_ = stakedNftList_[j].point
              }
            }
            _newWalletNftInfo.push({
              token_id: _tempNftInfo[i].token_id,
              serial_number: _tempNftInfo[i].serial_number,
              imageUrl: _nftInfoResponse.metaData.imageUrl,
              name: _nftInfoResponse.metaData.name,
              creator: _nftInfoResponse.metaData.creator,
              status: _stakeStatus,
              point: point_
            })
          }
        }
      }

      if (!_nextLink || _nextLink === null) break;

      if (_newWalletNftInfo.length >= 10) {
        setMirrorNodeNextLink(_nextLink);
        break;
      }

      _WNinfo = await getRequest(env.MIRROR_NET_URL + _nextLink);
      _nextLink = null;
      if (_WNinfo && _WNinfo.nfts.length > 0)
        _nextLink = _WNinfo.links.next;
    }

    if (_newWalletNftInfo.length == 0)
      setText("You are not a DeraGods holder");

    if (walletNftList)
      setWalletNftList(walletNftList.concat(_newWalletNftInfo));
    else
      setWalletNftList(_newWalletNftInfo);
    console.log(_newWalletNftInfo);
  }

  const getNftInfoFromMirrorNet = async (tokenId_, serialNum_) => {
    const g_singleNftInfo = await getRequest(`${env.MIRROR_NET_URL}/api/v1/tokens/${tokenId_}/nfts?serialNumber=${serialNum_}`);
    if (g_singleNftInfo && g_singleNftInfo.nfts.length > 0) {
      let g_preMdUrl = base64ToUtf8(g_singleNftInfo.nfts[0].metadata).split("//");

      let _metadataUrl = '';
      let ipfsType = 0;
      if (g_preMdUrl[0].includes('ipfs') == true) {
        _metadataUrl = env.IPFS_URL + g_preMdUrl[g_preMdUrl.length - 1];
        ipfsType = 1;
      }
      else if (g_preMdUrl[0].includes('https') == true) {
        if (g_preMdUrl[g_preMdUrl.length - 1].includes('ipfs.infura.io') == true) {
          let preMdUrlList = g_preMdUrl[g_preMdUrl.length - 1].split('/');
          _metadataUrl = env.IPFS_URL + preMdUrlList[preMdUrlList?.length - 1];
          ipfsType = 2;
        }
        else if (g_preMdUrl[g_preMdUrl.length - 1].includes('cloudflare-ipfs.com') == true) { //issue
          return { result: false };
          // let preMdUrlList = g_preMdUrl[g_preMdUrl.length - 1].split('/');
          // _metadataUrl = env.IPFS_URL + preMdUrlList[preMdUrlList?.length - 1];
          // ipfsType = 3;
        }
      }

      const _metadataInfo = await getRequest(_metadataUrl); // get NFT metadata
      if (_metadataInfo && _metadataInfo.image != undefined && _metadataInfo.image?.type != "string") {
        let _imageUrlList;
        if (ipfsType == 1)
          _imageUrlList = _metadataInfo.image.split('://');
        else if (ipfsType == 2)
          _imageUrlList = _metadataInfo.image.split('/');
        else if (ipfsType == 3)
          _imageUrlList = _metadataInfo.image.description.split('ipfs/');

        let _imageUrlLen = _imageUrlList?.length;
        let _imageUrl = "";
        if (ipfsType == 1) {
          if (_imageUrlLen == 2)
            _imageUrl = env.IPFS_URL + _imageUrlList[_imageUrlLen - 1];
          else if (_imageUrlLen == 3)
            _imageUrl = env.IPFS_URL + _imageUrlList[_imageUrlLen - 2] + "/" + _imageUrlList[_imageUrlLen - 1];
        }
        else if (ipfsType == 2) {
          _imageUrl = env.IPFS_URL + _imageUrlList[_imageUrlLen - 1];
        }
        else if (ipfsType == 3) {
          _imageUrl = env.IPFS_URL + _imageUrlList[_imageUrlLen - 1];
        }

        const _metaData = {
          creator: _metadataInfo.creator,
          name: _metadataInfo.name,
          imageUrl: _imageUrl
        };
        return { result: true, metaData: _metaData };
      }
      return { result: false };
    }
    return { result: false };
  }

  // convert metadata base64 string to utf8
  const base64ToUtf8 = (base64Str_) => {
    // create a buffer
    const _buff = Buffer.from(base64Str_, 'base64');

    // decode buffer as UTF-8
    const _utf8Str = _buff.toString('utf-8');

    return _utf8Str;
  }

  const onStakeHandle = async (nftInfo_) => {
    setLoadingView(true);
    let stakingInfo = {
      token_id: btoa(nftInfo_.token_id),
      serial_number: btoa(nftInfo_.serial_number),
    };

    const _postData = {
      discordName: btoa(userDetails.username),
      discriminator: btoa(userDetails.discriminator),
      walletId: btoa(walletId),
      nftInfo: stakingInfo
    };

    const _res = await postRequest(env.SERVER_URL + "/api/stake/stake_new_nfts", _postData);
    if (!_res) {
      toast.error("Something wrong with server!");
      setLoadingView(false);
      return;
    }
    if (!_res.result) {
      toast.error(_res.error);
      setLoadingView(false);
      return;
    }
    reloadNftList(nftInfo_, "staked")
    toast.success(_res.msg)
    setLoadingView(false)
  }

  const onUnStakeHandle = async (nftInfo_) => {
    setLoadingView(true);
    let unstakingInfo = {
      token_id: btoa(nftInfo_.token_id),
      serial_number: btoa(nftInfo_.serial_number),
    };

    const _postData = {
      discordName: btoa(userDetails.username),
      discriminator: btoa(userDetails.discriminator),
      walletId: btoa(walletId),
      nftInfo: unstakingInfo
    };

    const _res = await postRequest(env.SERVER_URL + "/api/stake/unstake", _postData);
    if (!_res) {
      toast.error("Something wrong with server!");
      setLoadingView(false);
      return;
    }
    if (!_res.result) {
      toast.error(_res.error);
      setLoadingView(false);
      return;
    }
    reloadNftList(nftInfo_, "unstaked")
    toast.success(_res.msg);
    setLoadingView(false);
  }

  const reloadNftList = (nftInfo_, status_) => {
    // reload status
    let _walletData = []
    for (let i = 0; i < walletNftList.length; i++) {
      _walletData.push(walletNftList[i])
    }
    for (let i = 0; i < _walletData.length; i++) {
      if (_walletData[i].token_id == nftInfo_.token_id && _walletData[i].serial_number == nftInfo_.serial_number)
        _walletData[i].status = status_
    }
    setWalletNftList(_walletData)
  }

  return (
    <>
      <div className='staking-container'>
        <a href="https://deragods-staking.web.app/">
          <img width="108" loading="lazy" src="/icons/Logo.png" />
        </a>
        <a href="https://www.plutopeer.com/" target="_blank" rel="noreferrer">
          <img className='absolute left-[15px] bottom-[20px]' width="140" loading="lazy" src="/icons/Plutopeer.png" />
        </a>
        <div className='absolute flex flex-row gap-4 top-8 right-24'>
          <img className='rounded-lg hover:cursor-pointer' width="48" loading="lazy" src="/images/discord-login-button.jpg" onClick={() => {
            setdiscordLoginFlag(true);
            if (walletId != null)
              checkUser()
            else
              setText("You must connect HashPack Wallet");
            // window.location = AUTHORIZATION_URL
          }} />
          <img className='rounded-lg hover:cursor-pointer' width="48" loading="lazy" src="/images/hashpack-connect-button.webp" onClick={() => {
            if (walletId != null) {
              setWalletId(null)
              onClickDisconnectHashPack();
            }
            else
              onClickConnectHashPack();
          }} />
        </div>
        {
          walletId == null &&
          <h1 className="mt-16 text-2xl font-bold leading-none tracking-tight text-red-900 md:text-5xl lg:text-6xl">{text}</h1>
        }
        {
          walletId != null && discordLoginFlag == false &&
          <h1 className="mt-16 text-2xl font-bold leading-none tracking-tight text-red-900 md:text-5xl lg:text-6xl">{text}</h1>
        }
        {
          walletId != null && text == "You are not a DeraGods holder" &&
          <h1 className="mt-16 text-2xl font-bold leading-none tracking-tight text-red-900 md:text-5xl lg:text-6xl">{text}</h1>
        }
        {
          walletId != null &&
          <div className='flex flex-col w-3/5 mb-12 pl-8 pt-8 pr-8 pb-8 gap-8 rounded-xl overflow-y-auto'>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {
                walletNftList?.map((item, index) => {
                  return (
                    <NftCard key={index}
                      nftInfo={item}
                      onClickStake={async (nftInfo) => {
                        await onStakeHandle(nftInfo);
                      }}
                      onClickUnStake={async (nftInfo) => {
                        await onUnStakeHandle(nftInfo);
                      }}
                    />
                  )
                })
              }
            </div>
          </div>
        }
      </div>
      {
        loadingView &&
        <LoadingLayout />
      }
      <ToastContainer autoClose={5000} draggableDirection="x" />
    </>
  )
}

export default StakingPage