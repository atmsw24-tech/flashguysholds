// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import "./RobinhoodFixedSupplyToken.sol";
import "./FlashboysFeeRouter.sol";
interface IFlashboysGraduationAdapter { function onGraduate(address token,uint256 tokenAmount,address feeCollector) external payable; }

/// @notice Native-ETH constant-product launch curve. Trading fee is 1% by default;
/// each buy/sell fee is split 70/30 by the independent FLASHBOYS router.
contract FlashboysBondingCurve {
 uint256 public constant BPS=10_000; uint256 public constant TOKEN_SUPPLY=1_000_000_000 ether;
 RobinhoodFixedSupplyToken public immutable token; FlashboysFeeRouter public immutable feeRouter;
 address public immutable creator; address public immutable graduationAdapter;
 uint16 public immutable feeBps; uint256 public immutable graduationThreshold;
 uint256 public virtualEthReserve; uint256 public virtualTokenReserve; uint256 public nativeReserve;
 bool public graduated; bool private entered;
 event Bought(address indexed buyer,uint256 ethIn,uint256 fee,uint256 tokensOut);
 event Sold(address indexed seller,uint256 tokensIn,uint256 grossEthOut,uint256 fee,uint256 netEthOut);
 event Graduated(address indexed adapter,uint256 tokenAmount,uint256 nativeLiquidity);
 error Unauthorized(); error InvalidAmount(); error Slippage(); error AlreadyGraduated();
 error NotGraduationReady(); error TransferFailed(); error ReentrantCall(); error AdapterNotConfigured();
 modifier nonReentrant(){if(entered)revert ReentrantCall();entered=true;_;entered=false;}
 constructor(address creator_,address token_,address router_,address adapter_,uint16 feeBps_,uint256 threshold_,uint256 virtualEth_){
  if(creator_==address(0)||token_==address(0)||router_==address(0))revert Unauthorized();
  if(feeBps_==0||feeBps_>=1000||threshold_==0||virtualEth_==0)revert InvalidAmount();
  creator=creator_;token=RobinhoodFixedSupplyToken(token_);feeRouter=FlashboysFeeRouter(payable(router_));
  graduationAdapter=adapter_;feeBps=feeBps_;graduationThreshold=threshold_;virtualEthReserve=virtualEth_;virtualTokenReserve=TOKEN_SUPPLY;
 }
 function buy(uint256 minTokensOut) external payable nonReentrant returns(uint256 tokensOut){
  if(graduated)revert AlreadyGraduated();if(msg.value==0)revert InvalidAmount();
  uint256 fee=msg.value*feeBps/BPS;uint256 netIn=msg.value-fee;
  uint256 k=virtualEthReserve*virtualTokenReserve;uint256 newEth=virtualEthReserve+netIn;
  uint256 newTokens=k/newEth;tokensOut=virtualTokenReserve-newTokens;
  if(tokensOut==0||tokensOut>token.balanceOf(address(this)))revert InvalidAmount();if(tokensOut<minTokensOut)revert Slippage();
  virtualEthReserve=newEth;virtualTokenReserve=newTokens;nativeReserve+=netIn;
  if(fee>0)feeRouter.collectNativeFee{value:fee}();_safeTransfer(msg.sender,tokensOut);emit Bought(msg.sender,msg.value,fee,tokensOut);
 }
 function sell(uint256 amount,uint256 minEthOut) external nonReentrant returns(uint256 netOut){
  if(graduated)revert AlreadyGraduated();if(amount==0)revert InvalidAmount();
  _safeTransferFrom(msg.sender,address(this),amount);
  uint256 k=virtualEthReserve*virtualTokenReserve;uint256 newTokens=virtualTokenReserve+amount;
  uint256 newEth=k/newTokens;uint256 gross=virtualEthReserve-newEth;uint256 fee=gross*feeBps/BPS;netOut=gross-fee;
  if(netOut==0||netOut<minEthOut||netOut>nativeReserve)revert Slippage();
  virtualTokenReserve=newTokens;virtualEthReserve=newEth;nativeReserve-=netOut;
  if(fee>0)feeRouter.collectNativeFee{value:fee}();(bool ok,)=payable(msg.sender).call{value:netOut}("");if(!ok)revert TransferFailed();
  emit Sold(msg.sender,amount,gross,fee,netOut);
 }
 function graduate() external nonReentrant {
  if(graduated)revert AlreadyGraduated();if(nativeReserve<graduationThreshold)revert NotGraduationReady();
  if(graduationAdapter==address(0))revert AdapterNotConfigured();graduated=true;
  uint256 amount=token.balanceOf(address(this));uint256 liquidity=nativeReserve;nativeReserve=0;
  _safeTransferTo(graduationAdapter,amount);
  IFlashboysGraduationAdapter(graduationAdapter).onGraduate{value:liquidity}(address(token),amount,address(feeRouter));
  emit Graduated(graduationAdapter,amount,liquidity);
 }
 function _safeTransfer(address to,uint256 amount) private {_transferToken(to,amount);}
 function _safeTransferTo(address to,uint256 amount) private {_transferToken(to,amount);}
 function _transferToken(address to,uint256 amount) private {
  (bool ok,bytes memory data)=address(token).call(abi.encodeWithSignature("transfer(address,uint256)",to,amount));
  if(!ok||(data.length!=0&&!abi.decode(data,(bool))))revert TransferFailed();
 }
 function _safeTransferFrom(address from,address to,uint256 amount) private {
  (bool ok,bytes memory data)=address(token).call(abi.encodeWithSignature("transferFrom(address,address,uint256)",from,to,amount));
  if(!ok||(data.length!=0&&!abi.decode(data,(bool))))revert TransferFailed();
 }
}