//+------------------------------------------------------------------+
//| NB FX - Momentum Pause Breakout (MT4)                            |
//| Detects: strong move -> pause/small candle -> confirmed breakout |
//| Non-repainting: signals only after a candle has CLOSED.         |
//| Default use: M1. Test on demo before any live use.                |
//+------------------------------------------------------------------+
#property strict
#property indicator_chart_window
#property indicator_buffers 2
#property indicator_color1 Lime
#property indicator_color2 Red
#property indicator_width1 2
#property indicator_width2 2

extern int    StrongCandles       = 2;      // Number of strong candles before pause
extern int    ATRPeriod           = 14;
extern double StrongBodyATR       = 0.55;   // Strong candle body >= ATR * this value
extern double PauseBodyATR        = 0.30;   // Pause candle body <= ATR * this value
extern double PauseRangeATR       = 0.85;   // Pause candle range <= ATR * this value
extern double BreakoutBufferATR   = 0.05;   // Breakout close buffer beyond pause high/low
extern bool   RequireSameDirectionStrongCandles = true;
extern bool   EnablePopupAlert    = true;
extern bool   EnableSoundAlert    = false;
extern string AlertSound          = "alert.wav";
extern bool   ShowSetupMarkers    = true;
extern int    MaxBarsToScan       = 3000;

double BuyBuffer[];
double SellBuffer[];
double SetupUpBuffer[];
double SetupDownBuffer[];
datetime lastAlertBarTime = 0;

//+------------------------------------------------------------------+
int OnInit()
{
   IndicatorShortName("NB FX Momentum Pause Breakout");
   SetIndexBuffer(0, BuyBuffer);
   SetIndexStyle(0, DRAW_ARROW);
   SetIndexArrow(0, 233);
   SetIndexLabel(0, "BUY breakout");

   SetIndexBuffer(1, SellBuffer);
   SetIndexStyle(1, DRAW_ARROW);
   SetIndexArrow(1, 234);
   SetIndexLabel(1, "SELL breakout");

   ArraySetAsSeries(BuyBuffer, true);
   ArraySetAsSeries(SellBuffer, true);

   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
double CandleBody(int shift)
{
   return(MathAbs(Close[shift] - Open[shift]));
}

double CandleRange(int shift)
{
   return(High[shift] - Low[shift]);
}

bool IsStrongCandle(int shift, int direction)
{
   double atr = iATR(NULL, 0, ATRPeriod, shift);
   if(atr <= 0) return(false);

   bool directionOK = (direction > 0) ? (Close[shift] > Open[shift])
                                      : (Close[shift] < Open[shift]);
   if(!directionOK) return(false);

   return(CandleBody(shift) >= atr * StrongBodyATR);
}

bool IsPauseCandle(int shift)
{
   double atr = iATR(NULL, 0, ATRPeriod, shift);
   if(atr <= 0) return(false);

   // A pause candle has a relatively small body and limited total range.
   return(CandleBody(shift) <= atr * PauseBodyATR &&
          CandleRange(shift) <= atr * PauseRangeATR);
}

bool HasStrongRunBeforePause(int pauseShift)
{
   int firstStrongShift = pauseShift + 1;
   int direction = 0;

   for(int n = 0; n < StrongCandles; n++)
   {
      int s = firstStrongShift + n;
      if(s >= Bars) return(false);

      int thisDirection = 0;
      if(Close[s] > Open[s]) thisDirection = 1;
      if(Close[s] < Open[s]) thisDirection = -1;
      if(thisDirection == 0) return(false);

      if(n == 0) direction = thisDirection;
      if(RequireSameDirectionStrongCandles && thisDirection != direction)
         return(false);

      if(!IsStrongCandle(s, thisDirection))
         return(false);
   }
   return(true);
}

// Returns true if the candle immediately after the pause has closed
// beyond the pause candle's high or low by the configured ATR buffer.
int GetBreakoutDirection(int pauseShift)
{
   int breakoutShift = pauseShift - 1;
   if(breakoutShift < 1) return(0); // shift 0 is still forming

   double atr = iATR(NULL, 0, ATRPeriod, pauseShift);
   if(atr <= 0) return(0);
   double buffer = atr * BreakoutBufferATR;

   if(Close[breakoutShift] > High[pauseShift] + buffer)
      return(1);
   if(Close[breakoutShift] < Low[pauseShift] - buffer)
      return(-1);

   return(0);
}

//+------------------------------------------------------------------+
int OnCalculate(const int rates_total,
                const int prev_calculated,
                const datetime &time[],
                const double &open[],
                const double &high[],
                const double &low[],
                const double &close[],
                const long &tick_volume[],
                const long &volume[],
                const int &spread[])
{
   if(rates_total < ATRPeriod + StrongCandles + 5)
      return(0);

   int limit;
   if(prev_calculated == 0)
   {
      ArrayInitialize(BuyBuffer, EMPTY_VALUE);
      ArrayInitialize(SellBuffer, EMPTY_VALUE);
      limit = MathMin(rates_total - StrongCandles - 2, MaxBarsToScan);
   }
   else
   {
      // Recheck recent bars so a just-closed breakout candle is evaluated.
      limit = MathMin(rates_total - prev_calculated + 3, 10);
   }

   for(int i = limit; i >= 1; i--)
   {
      BuyBuffer[i] = EMPTY_VALUE;
      SellBuffer[i] = EMPTY_VALUE;

      int pauseShift = i + 1;
      if(pauseShift + StrongCandles >= rates_total) continue;

      if(!IsPauseCandle(pauseShift)) continue;
      if(!HasStrongRunBeforePause(pauseShift)) continue;

      int direction = GetBreakoutDirection(pauseShift);
      if(direction == 1)
         BuyBuffer[i] = Low[i] - iATR(NULL, 0, ATRPeriod, i) * 0.20;
      else if(direction == -1)
         SellBuffer[i] = High[i] + iATR(NULL, 0, ATRPeriod, i) * 0.20;
   }

   // Alert only once for the most recently CLOSED candle.
   if(EnablePopupAlert && Time[1] != lastAlertBarTime)
   {
      if(BuyBuffer[1] != EMPTY_VALUE)
      {
         Alert(Symbol(), " M", Period(), " | BUY: pause-range breakout confirmed");
         if(EnableSoundAlert) PlaySound(AlertSound);
         lastAlertBarTime = Time[1];
      }
      else if(SellBuffer[1] != EMPTY_VALUE)
      {
         Alert(Symbol(), " M", Period(), " | SELL: pause-range breakout confirmed");
         if(EnableSoundAlert) PlaySound(AlertSound);
         lastAlertBarTime = Time[1];
      }
   }

   return(rates_total);
}
//+------------------------------------------------------------------+
