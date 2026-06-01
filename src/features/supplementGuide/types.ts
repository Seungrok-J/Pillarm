export type SupplementCategory =
  | 'vitamin_fat'    // 지용성 비타민 (A·D·E·K)
  | 'vitamin_water'  // 수용성 비타민 (B군·C)
  | 'mineral'        // 미네랄 (칼슘·철분·마그네슘·아연)
  | 'omega'          // 오메가지방산
  | 'probiotic'      // 프로바이오틱스
  | 'other';         // 루테인·콜라겐·코엔자임Q10 등

export type TimingType =
  | 'after_meal'
  | 'before_meal'
  | 'with_meal'
  | 'empty_stomach'
  | 'bedtime'
  | 'anytime';

export interface SupplementSource {
  name: string;
  url:  string;
  note?: string;
}

export interface SupplementGuide {
  id:       string;
  name:     string;
  nameEn?:  string;
  category: SupplementCategory;
  emoji:    string;

  timing: {
    type:          TimingType;
    minutesAfter?:  number;
    minutesBefore?: number;
    detail:        string;
  };

  goodWith:  string[];
  avoidWith: string[];
  summary:   string;
  details:   string;
  sources:   SupplementSource[];
}
