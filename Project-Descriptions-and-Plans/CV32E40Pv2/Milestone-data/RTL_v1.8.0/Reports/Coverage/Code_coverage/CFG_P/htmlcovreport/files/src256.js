var g_data = {"name":"/shark0/processing/cv32e40p/users/processing/PRODUCTS_DIGITAL_DESIGN/PANTHER/PANTHER_1.0/CV32/NR/CFG_P/NR_QUESTA_INT_DEBUG_LONG/workdir/core-v-cores/cv32e40p/rtl/cv32e40p_alu_div.sv","src":"// Copyright 2018 ETH Zurich and University of Bologna.\n// Copyright and related rights are licensed under the Solderpad Hardware\n// License, Version 0.51 (the \"License\"); you may not use this file except in\n// compliance with the License.  You may obtain a copy of the License at\n// http://solderpad.org/licenses/SHL-0.51. Unless required by applicable law\n// or agreed to in writing, software, hardware and materials distributed under\n// this License is distributed on an \"AS IS\" BASIS, WITHOUT WARRANTIES OR\n// CONDITIONS OF ANY KIND, either express or implied. See the License for the\n// specific language governing permissions and limitations under the License.\n\n///////////////////////////////////////////////////////////////////////////////\n// File       : Simple Serial Divider\n// Ver        : 1.0\n// Date       : 15.03.2016\n///////////////////////////////////////////////////////////////////////////////\n//\n// Description: this is a simple serial divider for signed integers (int32).\n//\n///////////////////////////////////////////////////////////////////////////////\n//\n// Authors    : Michael Schaffner (schaffner@iis.ee.ethz.ch)\n//              Andreas Traber    (atraber@iis.ee.ethz.ch)\n//\n///////////////////////////////////////////////////////////////////////////////\n\nmodule cv32e40p_alu_div #(\n    parameter C_WIDTH     = 32,\n    parameter C_LOG_WIDTH = 6\n) (\n    input  logic                   Clk_CI,\n    input  logic                   Rst_RBI,\n    // input IF\n    input  logic [    C_WIDTH-1:0] OpA_DI,\n    input  logic [    C_WIDTH-1:0] OpB_DI,\n    input  logic [C_LOG_WIDTH-1:0] OpBShift_DI,\n    input  logic                   OpBIsZero_SI,\n    //\n    input  logic                   OpBSign_SI,  // gate this to 0 in case of unsigned ops\n    input  logic [            1:0] OpCode_SI,  // 0: udiv, 2: urem, 1: div, 3: rem\n    // handshake\n    input  logic                   InVld_SI,\n    // output IF\n    input  logic                   OutRdy_SI,\n    output logic                   OutVld_SO,\n    output logic [    C_WIDTH-1:0] Res_DO\n);\n\n  ///////////////////////////////////////////////////////////////////////////////\n  // signal declarations\n  ///////////////////////////////////////////////////////////////////////////////\n\n  logic [C_WIDTH-1:0] ResReg_DP, ResReg_DN;\n  logic [C_WIDTH-1:0] ResReg_DP_rev;\n  logic [C_WIDTH-1:0] AReg_DP, AReg_DN;\n  logic [C_WIDTH-1:0] BReg_DP, BReg_DN;\n\n  logic RemSel_SN, RemSel_SP;\n  logic CompInv_SN, CompInv_SP;\n  logic ResInv_SN, ResInv_SP;\n\n  logic [C_WIDTH-1:0] AddMux_D;\n  logic [C_WIDTH-1:0] AddOut_D;\n  logic [C_WIDTH-1:0] AddTmp_D;\n  logic [C_WIDTH-1:0] BMux_D;\n  logic [C_WIDTH-1:0] OutMux_D;\n\n  logic [C_LOG_WIDTH-1:0] Cnt_DP, Cnt_DN;\n  logic CntZero_S;\n\n  logic ARegEn_S, BRegEn_S, ResRegEn_S, ABComp_S, PmSel_S, LoadEn_S;\n\n  enum logic [1:0] {\n    IDLE,\n    DIVIDE,\n    FINISH\n  }\n      State_SN, State_SP;\n\n\n  ///////////////////////////////////////////////////////////////////////////////\n  // datapath\n  ///////////////////////////////////////////////////////////////////////////////\n\n  assign PmSel_S  = LoadEn_S & ~(OpCode_SI[0] & (OpA_DI[$high(OpA_DI)] ^ OpBSign_SI));\n\n  // muxes\n  assign AddMux_D = (LoadEn_S) ? OpA_DI : BReg_DP;\n\n  // attention: logical shift in case of negative operand B!\n  assign BMux_D   = (LoadEn_S) ? OpB_DI : {CompInv_SP, (BReg_DP[$high(BReg_DP):1])};\n\n  genvar index;\n  generate\n    for (index = 0; index < C_WIDTH; index++) begin : gen_bit_swapping\n      assign ResReg_DP_rev[index] = ResReg_DP[C_WIDTH-1-index];\n    end\n  endgenerate\n\n  assign OutMux_D = (RemSel_SP) ? AReg_DP : ResReg_DP_rev;\n\n  // invert if necessary\n  assign Res_DO = (ResInv_SP) ? -$signed(OutMux_D) : OutMux_D;\n\n  // main comparator\n  assign ABComp_S    = ((AReg_DP == BReg_DP) | ((AReg_DP > BReg_DP) ^ CompInv_SP)) & ((|AReg_DP) | OpBIsZero_SI);\n\n  // main adder\n  assign AddTmp_D = (LoadEn_S) ? 0 : AReg_DP;\n  assign AddOut_D = (PmSel_S) ? AddTmp_D + AddMux_D : AddTmp_D - $signed(AddMux_D);\n\n  ///////////////////////////////////////////////////////////////////////////////\n  // counter\n  ///////////////////////////////////////////////////////////////////////////////\n\n  assign Cnt_DN = (LoadEn_S) ? OpBShift_DI : (~CntZero_S) ? Cnt_DP - 1 : Cnt_DP;\n\n  assign CntZero_S = ~(|Cnt_DP);\n\n  ///////////////////////////////////////////////////////////////////////////////\n  // FSM\n  ///////////////////////////////////////////////////////////////////////////////\n\n  always_comb begin : p_fsm\n    // default\n    State_SN   = State_SP;\n\n    OutVld_SO  = 1'b0;\n\n    LoadEn_S   = 1'b0;\n\n    ARegEn_S   = 1'b0;\n    BRegEn_S   = 1'b0;\n    ResRegEn_S = 1'b0;\n\n    case (State_SP)\n      /////////////////////////////////\n      IDLE: begin\n        OutVld_SO = 1'b1;\n\n        if (InVld_SI) begin\n          OutVld_SO = 1'b0;\n          ARegEn_S  = 1'b1;\n          BRegEn_S  = 1'b1;\n          LoadEn_S  = 1'b1;\n          State_SN  = DIVIDE;\n        end\n      end\n      /////////////////////////////////\n      DIVIDE: begin\n\n        ARegEn_S   = ABComp_S;\n        BRegEn_S   = 1'b1;\n        ResRegEn_S = 1'b1;\n\n        // calculation finished\n        // one more divide cycle (32nd divide cycle)\n        if (CntZero_S) begin\n          State_SN = FINISH;\n        end\n      end\n      /////////////////////////////////\n      FINISH: begin\n        OutVld_SO = 1'b1;\n\n        if (OutRdy_SI) begin\n          State_SN = IDLE;\n        end\n      end\n      /////////////////////////////////\n      default:  /* default */;\n      /////////////////////////////////\n    endcase\n  end\n\n\n  ///////////////////////////////////////////////////////////////////////////////\n  // regs\n  ///////////////////////////////////////////////////////////////////////////////\n\n  // get flags\n  assign RemSel_SN = (LoadEn_S) ? OpCode_SI[1] : RemSel_SP;\n  assign CompInv_SN = (LoadEn_S) ? OpBSign_SI : CompInv_SP;\n  assign ResInv_SN = (LoadEn_S) ? (~OpBIsZero_SI | OpCode_SI[1]) & OpCode_SI[0] & (OpA_DI[$high(\n      OpA_DI\n  )] ^ OpBSign_SI) : ResInv_SP;\n\n  assign AReg_DN = (ARegEn_S) ? AddOut_D : AReg_DP;\n  assign BReg_DN = (BRegEn_S) ? BMux_D : BReg_DP;\n  assign ResReg_DN = (LoadEn_S) ? '0 : (ResRegEn_S) ? {\n    ABComp_S, ResReg_DP[$high(ResReg_DP):1]\n  } : ResReg_DP;\n\n  always_ff @(posedge Clk_CI or negedge Rst_RBI) begin : p_regs\n    if (~Rst_RBI) begin\n      State_SP   <= IDLE;\n      AReg_DP    <= '0;\n      BReg_DP    <= '0;\n      ResReg_DP  <= '0;\n      Cnt_DP     <= '0;\n      RemSel_SP  <= 1'b0;\n      CompInv_SP <= 1'b0;\n      ResInv_SP  <= 1'b0;\n    end else begin\n      State_SP   <= State_SN;\n      AReg_DP    <= AReg_DN;\n      BReg_DP    <= BReg_DN;\n      ResReg_DP  <= ResReg_DN;\n      Cnt_DP     <= Cnt_DN;\n      RemSel_SP  <= RemSel_SN;\n      CompInv_SP <= CompInv_SN;\n      ResInv_SP  <= ResInv_SN;\n    end\n  end\n\n  ///////////////////////////////////////////////////////////////////////////////\n  // assertions\n  ///////////////////////////////////////////////////////////////////////////////\n\n`ifdef CV32E40P_ASSERT_ON\n  initial begin : p_assertions\n    assert (C_LOG_WIDTH == $clog2(C_WIDTH + 1))\n    else $error(\"C_LOG_WIDTH must be $clog2(C_WIDTH+1)\");\n  end\n`endif\n\nendmodule  // serDiv\n","lang":"verilog"};
processSrcData(g_data);