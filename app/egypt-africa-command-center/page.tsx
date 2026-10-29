import Pilot from '../pilot';
import {commandCenterConfig} from '@/lib/command-center-isolation';
export const metadata={title:'DAF Egypt Command Center'};
export default function CommandCenterPage(){
 const c=commandCenterConfig();
 if(!c.enabled||!c.datasetId||c.datasetId==='pilot-main')return <main dir="rtl" className="training-page"><h1>DAF Egypt Command Center</h1><p>مسار تجربة مستقل قيد التجهيز. التشغيل يحتاج قاعدة بيانات ومرفقات وحسابات اختبار معزولة.</p><a href="/">العودة إلى النسخة الحالية</a></main>;
 return <Pilot commandCenter/>;
}
