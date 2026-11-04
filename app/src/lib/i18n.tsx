// App language: English or Marathi (मराठी), picked on the Login, Home and Shop screens and remembered
// on this phone / browser. Only the app's own words change. These stay as they are:
//   - the printed label and Word file (TO / From / COD FOR RUPEES … – the post office needs them so)
//   - what customers and staff type (names, addresses)
//   - numbers and dates (normal digits)
// Usage in a screen:  const { t } = useLang();  …  t('Save order')  /  t('{n} selected', { n })
// The English text is the key. A text missing below simply shows in English.
import { useSyncExternalStore } from 'react';
import { getPref, setPref } from './storage';

export type Lang = 'en' | 'mr';

let current: Lang = 'en';
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}

export function setLang(l: Lang) {
  if (l === current) return;
  current = l;
  setPref('lang', l);
  listeners.forEach((f) => f());
}

/** Reads the saved choice (call once at app start). */
export async function loadLang() {
  const v = await getPref('lang');
  if (v === 'mr' || v === 'en') {
    current = v;
    listeners.forEach((f) => f());
  }
}

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

/** Re-renders the screen when the language changes. */
export function useLang() {
  const lang = useSyncExternalStore(subscribe, getLang, getLang);
  return { lang, setLang, t };
}

type Vars = Record<string, string | number | null | undefined>;

/** Translate an English text (also server messages). {name} parts are filled from vars. */
export function t(en: string, vars?: Vars): string {
  let out = en;
  if (current === 'mr') {
    const mr = MR[en];
    if (mr !== undefined) out = mr;
    else {
      for (const [re, rep] of PATTERNS) {
        if (re.test(en)) {
          out = en.replace(re, rep);
          break;
        }
      }
    }
  }
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? '') : m));
  return out;
}

// Server messages with a changing part.
const PATTERNS: [RegExp, string][] = [
  [/^Pincode (\d+) is not in the India Post list\. Check the number with the customer\.$/, 'पिनकोड $1 India Post यादीत नाही. ग्राहकाकडून नंबर तपासून घ्या.'],
  [/^Already saved by (.+) at (.+)$/, '$1 यांनी $2 ला आधीच सेव्ह केली आहे'],
  [/^Same mobile and pincode saved by (.+) at (.+)$/, 'हाच मोबाइल आणि पिनकोड $1 यांनी $2 ला सेव्ह केला आहे'],
  [/^At most (\d+) emails per hour\. Please try again later\.$/, 'तासाला जास्तीत जास्त $1 ईमेल. थोड्या वेळाने पुन्हा प्रयत्न करा.'],
  [/^At most (\d+) characters$/, 'जास्तीत जास्त $1 अक्षरे'],
  [/^Too many wrong tries\. Try again after (\d+) minutes\.$/, 'खूप वेळा चुकीचे टाकले. $1 मिनिटांनी पुन्हा प्रयत्न करा.'],
  [/^Server not reachable .*$/, 'सर्व्हरशी संपर्क होत नाही. इंटरनेट तपासा आणि सर्व्हर चालू आहे का ते पाहा.'],
  [/^Server error \((\d+)\)$/, 'सर्व्हर त्रुटी ($1)'],
];

const MR: Record<string, string> = {
  // ---- language switch
  Language: 'भाषा',

  // ---- tabs, header
  Home: 'होम',
  'New order': 'नवीन ऑर्डर',
  Orders: 'ऑर्डर्स',
  Staff: 'स्टाफ',
  Shop: 'दुकान',
  ADMIN: 'मालक',
  STAFF: 'स्टाफ',

  // ---- login
  'Enter mobile number and password': 'मोबाइल नंबर आणि पासवर्ड टाका',
  'Orders and parcel labels': 'ऑर्डर्स आणि पार्सल लेबल्स',
  'Mobile number': 'मोबाइल नंबर',
  '10-digit mobile': '10 अंकी मोबाइल',
  Password: 'पासवर्ड',
  'Log in': 'लॉग इन करा',
  'Forgot password? Ask the owner to reset it.': 'पासवर्ड विसरलात? मालकांना रीसेट करायला सांगा.',

  // ---- change password
  'At least 6 characters': 'किमान 6 अक्षरे',
  'New and confirm match': 'नवीन आणि पुन्हा टाकलेला पासवर्ड जुळतो',
  'Different from temporary password': 'तात्पुरत्या पासवर्डपेक्षा वेगळा',
  'Different from current password': 'सध्याच्या पासवर्डपेक्षा वेगळा',
  'Please meet all three rules below.': 'खालील तिन्ही नियम पूर्ण करा.',
  'Change password': 'पासवर्ड बदला',
  'Save new password': 'नवीन पासवर्ड सेव्ह करा',
  '‹ Back': '‹ मागे',
  'First login': 'पहिले लॉगिन',
  'Set your own password before you start. The owner cannot see it.': 'सुरू करण्यापूर्वी तुमचा स्वतःचा पासवर्ड ठेवा. तो मालकांना दिसत नाही.',
  'Temporary password': 'तात्पुरता पासवर्ड',
  'Current password': 'सध्याचा पासवर्ड',
  'New password': 'नवीन पासवर्ड',
  'Confirm new password': 'नवीन पासवर्ड पुन्हा टाका',
  'Log out': 'लॉग आउट',

  // ---- shop
  'Shop details': 'दुकानाची माहिती',
  'Saved. The next Word file uses these details.': 'सेव्ह झाले. पुढच्या Word फाइलमध्ये ही माहिती येईल.',
  'Save shop details': 'दुकानाची माहिती सेव्ह करा',
  'Printed in the “From” block of every label.': 'प्रत्येक लेबलच्या “From” भागात छापले जाते.',
  'Shop name': 'दुकानाचे नाव',
  'Address line 1': 'पत्ता ओळ 1',
  'Address line 2': 'पत्ता ओळ 2',
  'City and pincode': 'शहर आणि पिनकोड',
  'Phone numbers': 'फोन नंबर',
  'Label preview': 'लेबल नमुना',

  // ---- home
  'Namaste, {name}': 'नमस्कार, {name}',
  'Today {n}': 'आज {n}',
  'Saved by me {n}': 'मी सेव्ह केलेल्या {n}',
  'Not printed {n}': 'प्रिंट बाकी {n}',
  '⬇  Print today’s labels ({n})': '⬇  आजची लेबल्स प्रिंट करा ({n})',
  'No labels to print right now': 'सध्या प्रिंट करायला लेबल नाही',
  '{n} older order not printed – open Orders': '{n} जुनी ऑर्डर प्रिंट बाकी – ऑर्डर्स उघडा',
  '{n} older orders not printed – open Orders': '{n} जुन्या ऑर्डर्स प्रिंट बाकी – ऑर्डर्स उघडा',
  'Saved by staff today': 'आज स्टाफने सेव्ह केलेल्या',
  'No orders saved yet today.': 'आज अजून एकही ऑर्डर सेव्ह नाही.',
  'Last order {time}': 'शेवटची ऑर्डर {time}',
  '{n} order': '{n} ऑर्डर',
  '{n} orders': '{n} ऑर्डर्स',
  'My recent orders': 'माझ्या अलीकडील ऑर्डर्स',
  'No orders yet.': 'अजून ऑर्डर नाही.',
  Printed: 'प्रिंट झाले',
  'Not printed': 'प्रिंट बाकी',
  'Fix anything below – the label above changes with it.': 'खाली काही चुकले असेल तर दुरुस्त करा – वरचे लेबल त्याप्रमाणे बदलेल.',

  // ---- paste screen
  'Nothing copied. In WhatsApp, long-press the customer’s message → Copy, then tap Paste again.':
    'काहीही कॉपी झालेले नाही. WhatsApp मध्ये ग्राहकाच्या मेसेजवर बोट दाबून ठेवा → Copy, मग पुन्हा पेस्ट दाबा.',
  'Press Ctrl+V in the box below to paste.': 'पेस्ट करण्यासाठी खालच्या बॉक्समध्ये Ctrl+V दाबा.',
  'Could not read the copied text. Paste it in the box below.': 'कॉपी केलेला मजकूर वाचता आला नाही. खालच्या बॉक्समध्ये पेस्ट करा.',
  'Please fill the fields marked in red.': 'लाल रंगात दाखवलेली माहिती भरा.',
  'Shipment type – pick before pasting': 'पार्सल प्रकार – पेस्ट करण्याआधी निवडा',
  '📋  Paste COD booking message': '📋  COD बुकिंग मेसेज पेस्ट करा',
  '📋  Paste from WhatsApp': '📋  WhatsApp मधून पेस्ट करा',
  'Copy the COD booking message (date, weight, amount, address), then tap here':
    'COD बुकिंग मेसेज (तारीख, वजन, रक्कम, पत्ता) कॉपी करा, मग इथे दाबा',
  'Copy the customer’s address message, then tap here': 'ग्राहकाचा पत्त्याचा मेसेज कॉपी करा, मग इथे दाबा',
  Message: 'मेसेज',
  '…or paste / type the message here': '…किंवा मेसेज इथे पेस्ट / टाइप करा',
  '{n} filled · check highlighted': '{n} भरले · रंगवलेले तपासा',
  '{n} fields auto-filled': '{n} माहिती आपोआप भरली',
  Clear: 'साफ करा',
  'District set from the pincode.': 'जिल्हा पिनकोडवरून भरला.',
  'State set from the pincode.': 'राज्य पिनकोडवरून भरले.',
  'District and State set from the pincode.': 'जिल्हा आणि राज्य पिनकोडवरून भरले.',
  'Saved #{id} · {name}': 'सेव्ह झाले #{id} · {name}',
  'Ready for the next order. Tap to view this one.': 'पुढच्या ऑर्डरसाठी तयार. ही ऑर्डर पाहण्यासाठी दाबा.',
  'Check the orange / red note above the form. If the label is right, tap Save again.':
    'फॉर्मच्या वरची नारिंगी / लाल सूचना तपासा. लेबल बरोबर असेल तर पुन्हा सेव्ह दाबा.',
  'Check the {n} orange / red notes above the form. If the label is right, tap Save again.':
    'फॉर्मच्या वरच्या {n} नारिंगी / लाल सूचना तपासा. लेबल बरोबर असेल तर पुन्हा सेव्ह दाबा.',
  'Checked – Save order': 'तपासले – ऑर्डर सेव्ह करा',
  'Save order': 'ऑर्डर सेव्ह करा',

  // ---- address checks
  '✓ Pincode {pin} · {place}': '✓ पिनकोड {pin} · {place}',
  'Pincode check is not available right now. Check the pincode yourself.': 'पिनकोड तपासणी सध्या चालू नाही. पिनकोड स्वतः तपासा.',
  'District / State do not match pincode {pin}': 'जिल्हा / राज्य पिनकोड {pin} शी जुळत नाही',
  'Address says': 'पत्त्यात लिहिले आहे',
  'District:': 'जिल्हा:',
  'State:': 'राज्य:',
  '→ pincode says': '→ पिनकोडप्रमाणे',
  'Use {x}': '{x} वापरा',
  'Keep as written': 'लिहिले तसेच ठेवा',
  'Not used: ': 'वापरले नाही: ',
  'Add to address': 'पत्त्यात जोडा',
  'Not needed': 'गरज नाही',

  // ---- duplicate sheet
  'Possible duplicate': 'कदाचित डुप्लिकेट',
  'Same customer recently': 'हाच ग्राहक नुकताच',
  'Same WhatsApp message': 'हाच WhatsApp मेसेज',
  'Same mobile + pincode': 'हाच मोबाइल + पिनकोड',
  '#{id} by {name}, {time}': '#{id} · {name}, {time}',
  "Cancel, don't save": 'रद्द करा, सेव्ह करू नका',
  'View saved order': 'सेव्ह केलेली ऑर्डर पाहा',
  'Save anyway (new order)': 'तरीही सेव्ह करा (नवीन ऑर्डर)',
  'A real second order? Ask the owner to save it.': 'खरोखर दुसरी ऑर्डर आहे? मालकांना सेव्ह करायला सांगा.',

  // ---- order form
  'Shipment type': 'पार्सल प्रकार',
  Prepaid: 'प्रीपेड',
  'COD details': 'COD माहिती',
  'Prints on every COD label: Booking Under {a} · Customer ID {b} · Contract ID {c} · {d}. From is always the shop. Size + Note print as “COD 1999 (Size 8 …)”.':
    'प्रत्येक COD लेबलवर छापले जाते: Booking Under {a} · Customer ID {b} · Contract ID {c} · {d}. From नेहमी दुकानाचे. साइज + नोट “COD 1999 (Size 8 …)” असे छापले जाते.',
  'COD amount (₹)': 'COD रक्कम (₹)',
  Weight: 'वजन',
  'e.g. 800 g': 'उदा. 800 g',
  'Booking date': 'बुकिंग तारीख',
  'Pick date': 'तारीख निवडा',
  'Product name (optional)': 'प्रॉडक्टचे नाव (ऐच्छिक)',
  'e.g. Kolhapuri Kurundwad': 'उदा. Kolhapuri Kurundwad',
  Size: 'साइज',
  'e.g. 9': 'उदा. 9',
  Name: 'नाव',
  Address: 'पत्ता',
  Landmark: 'खूण (लँडमार्क)',
  'Near school / road / chowk': 'शाळा / रस्ता / चौकाजवळ',
  Pincode: 'पिनकोड',
  'Mobile 1': 'मोबाइल 1',
  District: 'जिल्हा',
  State: 'राज्य',
  'Mobile 2': 'मोबाइल 2',
  Optional: 'ऐच्छिक',
  'Note (optional)': 'नोट (ऐच्छिक)',
  'e.g. RED': 'उदा. RED',
  'Amount (₹, optional)': 'रक्कम (₹, ऐच्छिक)',
  'Enter name': 'नाव टाका',
  'Enter address': 'पत्ता टाका',
  '6 digits, not starting with 0': '6 अंक, 0 ने सुरू नसलेले',
  'Enter 10 digits': '10 अंक टाका',
  'Same as Mobile 1 – leave empty or enter another number': 'मोबाइल 1 सारखाच आहे – रिकामे ठेवा किंवा दुसरा नंबर टाका',
  'Enter a number, e.g. 1299': 'आकडा टाका, उदा. 1299',
  'Enter COD amount': 'COD रक्कम टाका',
  'Pick a booking date': 'बुकिंग तारीख निवडा',

  // ---- label preview (only the screen words – the label itself stays English)
  'WILL PRINT · COD': 'असे छापले जाईल · COD',
  'WILL PRINT': 'असे छापले जाईल',
  '(bottom half empty)': '(खालचा अर्धा भाग रिकामा)',
  'The address appears here after you paste': 'पेस्ट केल्यावर पत्ता इथे दिसेल',
  'The label appears here after you paste': 'पेस्ट केल्यावर लेबल इथे दिसेल',

  // ---- orders
  'Orders successfully sent to {to}': 'ऑर्डर्स {to} ला यशस्वीपणे पाठवल्या',
  'Unable to send email. Please try again.': 'ईमेल पाठवता आला नाही. पुन्हा प्रयत्न करा.',
  'Downloaded {name} – opens in Excel': '{name} डाउनलोड झाले – Excel मध्ये उघडेल',
  'Showing deleted orders · tap to go back': 'डिलीट केलेल्या ऑर्डर्स दाखवत आहे · परत जाण्यासाठी दाबा',
  From: 'पासून',
  To: 'पर्यंत',
  'Any date': 'कोणतीही तारीख',
  'Search name, mobile or pincode': 'नाव, मोबाइल किंवा पिनकोड शोधा',
  'Preparing…': 'तयार करत आहे…',
  '⚠ {n} older order not printed – show it': '⚠ {n} जुनी ऑर्डर प्रिंट बाकी – दाखवा',
  '⚠ {n} older orders not printed – show them': '⚠ {n} जुन्या ऑर्डर्स प्रिंट बाकी – दाखवा',
  'Select all ({n})': 'सर्व निवडा ({n})',
  '{a} of {b}': '{b} पैकी {a}',
  '{n} printed order skipped – only the owner can print again': '{n} प्रिंट झालेली ऑर्डर वगळली – पुन्हा प्रिंट फक्त मालक करू शकतात',
  '{n} printed orders skipped – only the owner can print again': '{n} प्रिंट झालेल्या ऑर्डर्स वगळल्या – पुन्हा प्रिंट फक्त मालक करू शकतात',
  '{n} no': '{n} नं.',
  'Saved anyway': 'तरीही सेव्ह',
  Deleted: 'डिलीट केलेली',
  List: 'यादी',
  Table: 'टेबल',
  'No orders for this filter.': 'या फिल्टरसाठी ऑर्डर नाहीत.',
  'Showing {a} of {b}': '{b} पैकी {a} दाखवत आहे',
  'Show deleted orders': 'डिलीट केलेल्या ऑर्डर्स दाखवा',
  '{n} selected': '{n} निवडल्या',
  '{n} A4 page': '{n} A4 पान',
  '{n} A4 pages': '{n} A4 पाने',
  'Sending…': 'पाठवत आहे…',
  '✉  Send to Owner': '✉  मालकांना पाठवा',
  'Download Word': 'Word डाउनलोड करा',
  '✉ Email': '✉ ईमेल',
  '🖨  Print': '🖨  प्रिंट',
  '⬇ Word': '⬇ Word',
  '{n} orders sent to the print window and marked printed.': '{n} ऑर्डर्स प्रिंटसाठी पाठवल्या आणि प्रिंट झाल्या म्हणून नोंदवल्या.',
  'Print page could not be loaded': 'प्रिंट पान उघडता आले नाही',
  Customer: 'ग्राहक',
  Date: 'तारीख',
  Mobile: 'मोबाइल',
  'Added by': 'कोणी जोडली',
  printed: 'प्रिंट झाले',
  'not printed': 'प्रिंट बाकी',
  yesterday: 'काल',

  // ---- order detail
  Order: 'ऑर्डर',
  Back: 'मागे',
  'Order #{id}': 'ऑर्डर #{id}',
  'Saved. This order was already printed – download its label again.': 'सेव्ह झाले. ही ऑर्डर आधीच प्रिंट झाली होती – तिचे लेबल पुन्हा डाउनलोड करा.',
  'Changes saved.': 'बदल सेव्ह झाले.',
  'Order restored.': 'ऑर्डर परत आणली.',
  'Restore order': 'ऑर्डर परत आणा',
  'Save changes': 'बदल सेव्ह करा',
  'Tap again to delete': 'डिलीट करण्यासाठी पुन्हा दाबा',
  Delete: 'डिलीट',
  'Saved by {name} · {time}': '{name} यांनी सेव्ह केली · {time}',
  'Already printed – reprint after editing.': 'आधीच प्रिंट झाली – बदल केल्यावर पुन्हा प्रिंट करा.',
  'You can view this order but not edit it.': 'तुम्ही ही ऑर्डर पाहू शकता, पण बदलू शकत नाही.',
  'Original WhatsApp message': 'मूळ WhatsApp मेसेज',
  Hide: 'लपवा',
  Show: 'दाखवा',
  '(typed by hand, nothing pasted)': '(हाताने टाइप केले, काही पेस्ट केले नाही)',
  'Only the owner can delete orders.': 'ऑर्डर्स फक्त मालक डिलीट करू शकतात.',

  // ---- labels screen
  'Downloaded {name}': '{name} डाउनलोड झाले',
  '{n} page': '{n} पान',
  '{n} pages': '{n} पाने',
  'orders marked printed': 'ऑर्डर्स प्रिंट झाल्या म्हणून नोंदवल्या',
  'Download labels': 'लेबल्स डाउनलोड',
  '‹ Back to orders': '‹ ऑर्डर्सकडे परत',
  'No orders selected. Go to Orders, tick the orders and tap Download Word.':
    'एकही ऑर्डर निवडलेली नाही. ऑर्डर्समध्ये जा, ऑर्डर्सवर टिक करा आणि “Word डाउनलोड करा” दाबा.',
  '{n} orders → {p}': '{n} ऑर्डर्स → {p}',
  '2 labels per page': 'एका पानावर 2 लेबल्स',
  'Showing the first 2 pages of {p}.': '{p} पैकी पहिली 2 पाने दाखवत आहे.',
  'Mark these orders as printed': 'या ऑर्डर्स प्रिंट झाल्या म्हणून नोंदवा',
  'Preparing file…': 'फाइल तयार होत आहे…',
  '⬇  Download Word file (.docx)': '⬇  Word फाइल डाउनलोड करा (.docx)',
  'Earlier downloads': 'आधीचे डाउनलोड',
  'None yet.': 'अजून काही नाही.',
  'by {name}': '{name} यांनी',
  'Only the owner can download an earlier file again.': 'आधीची फाइल पुन्हा फक्त मालक डाउनलोड करू शकतात.',

  // ---- staff
  '{name} added. Tell them: mobile {m}, password {p}. They set their own password at first login.':
    '{name} जोडले. त्यांना सांगा: मोबाइल {m}, पासवर्ड {p}. पहिल्या लॉगिनला ते स्वतःचा पासवर्ड ठेवतील.',
  'Password for {name} reset to “{p}”. They must change it at next login.': '{name} यांचा पासवर्ड “{p}” केला. पुढच्या लॉगिनला त्यांनी तो बदलायचा आहे.',
  'Add staff': 'स्टाफ जोडा',
  'Staff name': 'स्टाफचे नाव',
  'Staff ({n} active)': 'स्टाफ ({n} सक्रिय)',
  'No staff yet. Add the first one above.': 'अजून स्टाफ नाही. वर पहिला जोडा.',
  '{a} of {b} on': '{b} पैकी {a} चालू',
  '{n} today': 'आज {n}',
  'new password pending': 'नवीन पासवर्ड बाकी',
  'Permissions ›': 'परवानग्या ›',
  'Reset password': 'पासवर्ड रीसेट करा',
  Active: 'सक्रिय',
  Removed: 'काढले',
  'New temporary password': 'नवीन तात्पुरता पासवर्ड',
  Reset: 'रीसेट',
  'Turning a staff member off logs them out on their next action. Their orders stay.':
    'स्टाफ बंद केल्यास त्यांच्या पुढच्या कृतीला ते लॉग आउट होतील. त्यांच्या ऑर्डर्स तशाच राहतील.',
  Permissions: 'परवानग्या',
  'Staff not found': 'स्टाफ सापडला नाही',
  '‹ Staff': '‹ स्टाफ',
  Printing: 'प्रिंटिंग',
  Special: 'विशेष',
  'Save new orders': 'नवीन ऑर्डर्स सेव्ह करणे',
  'See amounts': 'रक्कम पाहणे',
  'Edit own orders': 'स्वतःच्या ऑर्डर्स बदलणे',
  "Edit anyone's orders": 'कोणाच्याही ऑर्डर्स बदलणे',
  'Delete orders': 'ऑर्डर्स डिलीट करणे',
  'Reprint printed orders': 'प्रिंट झालेल्या ऑर्डर्स पुन्हा प्रिंट करणे',
  'Save anyway on duplicate': 'डुप्लिकेट असतानाही सेव्ह करणे',
  'Reset to default': 'मूळ सेटिंग',
  'Saved instantly. Applies on {name}’s next action.': 'लगेच सेव्ह होते. {name} यांच्या पुढच्या कृतीपासून लागू.',

  // ---- server messages
  'Already added': 'आधीच जोडले आहे',
  'Already sending – please wait.': 'आधीच पाठवत आहे – थोडे थांबा.',
  'Amount cannot be negative': 'रक्कम उणे असू शकत नाही',
  'Amount must be a number': 'रक्कम आकड्यात हवी',
  'Choose a different password': 'वेगळा पासवर्ड निवडा',
  'Current password is wrong': 'सध्याचा पासवर्ड चुकीचा आहे',
  'Email is not set up on the server yet.': 'सर्व्हरवर ईमेल अजून सेट केलेले नाही.',
  'Enter a 10-digit mobile': '10 अंकी मोबाइल टाका',
  'Enter city and pincode': 'शहर आणि पिनकोड टाका',
  'Enter mobile number': 'मोबाइल नंबर टाका',
  'Enter password': 'पासवर्ड टाका',
  'Enter phone numbers': 'फोन नंबर टाका',
  'Enter shop name': 'दुकानाचे नाव टाका',
  'Enter your current password': 'तुमचा सध्याचा पासवर्ड टाका',
  'File not found': 'फाइल सापडली नाही',
  'Mobile or password is wrong': 'मोबाइल किंवा पासवर्ड चुकीचा आहे',
  'Must be different from the old password': 'जुन्या पासवर्डपेक्षा वेगळा हवा',
  'No orders to print': 'प्रिंट करायला ऑर्डर नाहीत',
  'Only the owner can do this': 'हे फक्त मालक करू शकतात',
  'Only the owner can download an earlier file again': 'आधीची फाइल पुन्हा फक्त मालक डाउनलोड करू शकतात',
  'Only the owner can save a duplicate. Ask the owner.': 'डुप्लिकेट फक्त मालक सेव्ह करू शकतात. मालकांना सांगा.',
  'Only the owner can see deleted orders': 'डिलीट केलेल्या ऑर्डर्स फक्त मालक पाहू शकतात',
  'Order not found': 'ऑर्डर सापडली नाही',
  'Please check the highlighted fields': 'रंगवलेली माहिती तपासा',
  'Please log in': 'कृपया लॉग इन करा',
  'Please set your own password first': 'आधी तुमचा स्वतःचा पासवर्ड ठेवा',
  'Select at least one order': 'किमान एक ऑर्डर निवडा',
  'Session expired, please log in again': 'सत्र संपले, पुन्हा लॉग इन करा',
  'Something went wrong on the server': 'सर्व्हरवर काहीतरी चुकले',
  'The owner account cannot be turned off or reset here': 'मालकांचे खाते इथे बंद किंवा रीसेट करता येत नाही',
  'The owner always has every permission': 'मालकांना नेहमी सर्व परवानग्या असतात',
  'This account is turned off. Ask the owner.': 'हे खाते बंद आहे. मालकांना सांगा.',
  'This mobile is already added': 'हा मोबाइल आधीच जोडला आहे',
  'You can edit only the orders you saved': 'तुम्ही फक्त तुम्ही सेव्ह केलेल्या ऑर्डर्स बदलू शकता',
  'You do not have permission for this. Ask the owner.': 'याची परवानगी तुम्हाला नाही. मालकांना सांगा.',
};
