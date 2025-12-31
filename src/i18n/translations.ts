export type Language = 'en' | 'sw' | 'fr' | 'am';

export interface Translations {
  // Common
  appName: string;
  tagline: string;
  getStarted: string;
  signIn: string;
  signOut: string;
  loading: string;
  save: string;
  cancel: string;
  submit: string;
  back: string;
  next: string;
  yes: string;
  no: string;
  
  // Navigation
  home: string;
  dashboard: string;
  transactions: string;
  settings: string;
  earnings: string;
  
  // Hero Section
  heroTitle: string;
  heroSubtitle: string;
  heroDescription: string;
  
  // Stats
  activeUsers: string;
  countriesServed: string;
  rentFacilitated: string;
  dailyRepaymentRate: string;
  
  // User Types
  tenant: string;
  tenantDesc: string;
  agent: string;
  agentDesc: string;
  supporter: string;
  supporterDesc: string;
  landlord: string;
  landlordDesc: string;
  manager: string;
  
  // Features
  howItWorks: string;
  step1Title: string;
  step1Desc: string;
  step2Title: string;
  step2Desc: string;
  step3Title: string;
  step3Desc: string;
  step4Title: string;
  step4Desc: string;
  
  // Wallet
  walletBalance: string;
  deposit: string;
  withdraw: string;
  send: string;
  request: string;
  
  // Rent
  rentAmount: string;
  dailyRepayment: string;
  duration: string;
  totalRepayment: string;
  accessFee: string;
  requestRent: string;
  
  // Status
  pending: string;
  approved: string;
  rejected: string;
  completed: string;
  
  // Connection
  offline: string;
  slowConnection: string;
  online: string;
  
  // Footer
  footerTagline: string;
  allRightsReserved: string;
}

export const translations: Record<Language, Translations> = {
  en: {
    // Common
    appName: 'Welile',
    tagline: "Africa's Rent Facilitation Platform",
    getStarted: 'Get Started',
    signIn: 'Sign In',
    signOut: 'Sign Out',
    loading: 'Loading...',
    save: 'Save',
    cancel: 'Cancel',
    submit: 'Submit',
    back: 'Back',
    next: 'Next',
    yes: 'Yes',
    no: 'No',
    
    // Navigation
    home: 'Home',
    dashboard: 'Dashboard',
    transactions: 'Transactions',
    settings: 'Settings',
    earnings: 'Earnings',
    
    // Hero Section
    heroTitle: 'Access Rent Today',
    heroSubtitle: 'Pay Back Over Time',
    heroDescription: 'Join millions of Africans who trust Welile for flexible rent solutions. Get the rent you need now, repay in small daily amounts that fit your budget.',
    
    // Stats
    activeUsers: 'Active Users',
    countriesServed: 'Countries Served',
    rentFacilitated: 'Rent Facilitated',
    dailyRepaymentRate: 'Daily Repayment Rate',
    
    // User Types
    tenant: 'Tenant',
    tenantDesc: 'Access rent when you need it most. Repay in flexible daily installments.',
    agent: 'Agent',
    agentDesc: 'Earn commission by facilitating deposits and withdrawals in your community.',
    supporter: 'Supporter',
    supporterDesc: 'Help tenants access rent and earn returns on your support.',
    landlord: 'Landlord',
    landlordDesc: 'Receive guaranteed rent payments on time, every time.',
    manager: 'Manager',
    
    // Features
    howItWorks: 'How It Works',
    step1Title: 'Sign Up',
    step1Desc: 'Create your account in minutes with just your phone number.',
    step2Title: 'Request Rent',
    step2Desc: 'Tell us how much rent you need and your preferred repayment period.',
    step3Title: 'Get Funded',
    step3Desc: 'Receive funds directly to pay your landlord within 24 hours.',
    step4Title: 'Repay Daily',
    step4Desc: 'Make small daily payments that fit your budget until fully repaid.',
    
    // Wallet
    walletBalance: 'Wallet Balance',
    deposit: 'Deposit',
    withdraw: 'Withdraw',
    send: 'Send',
    request: 'Request',
    
    // Rent
    rentAmount: 'Rent Amount',
    dailyRepayment: 'Daily Repayment',
    duration: 'Duration',
    totalRepayment: 'Total Repayment',
    accessFee: 'Access Fee',
    requestRent: 'Request Rent',
    
    // Status
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    completed: 'Completed',
    
    // Connection
    offline: 'You are offline',
    slowConnection: 'Slow connection detected',
    online: 'Back online',
    
    // Footer
    footerTagline: 'Empowering Africa, one rent at a time.',
    allRightsReserved: 'All rights reserved.',
  },
  
  sw: {
    // Common - Swahili
    appName: 'Welile',
    tagline: 'Jukwaa la Uwezeshaji wa Kodi Afrika',
    getStarted: 'Anza Sasa',
    signIn: 'Ingia',
    signOut: 'Toka',
    loading: 'Inapakia...',
    save: 'Hifadhi',
    cancel: 'Ghairi',
    submit: 'Wasilisha',
    back: 'Rudi',
    next: 'Mbele',
    yes: 'Ndiyo',
    no: 'Hapana',
    
    // Navigation
    home: 'Nyumbani',
    dashboard: 'Dashibodi',
    transactions: 'Miamala',
    settings: 'Mipangilio',
    earnings: 'Mapato',
    
    // Hero Section
    heroTitle: 'Pata Kodi Leo',
    heroSubtitle: 'Lipa Pole Pole',
    heroDescription: 'Jiunge na mamilioni ya Waafrika wanaomwamini Welile kwa suluhisho za kodi zinazobadilika. Pata kodi unayohitaji sasa, lipa kwa kiasi kidogo cha kila siku.',
    
    // Stats
    activeUsers: 'Watumiaji Hai',
    countriesServed: 'Nchi Zinazohudhumiwa',
    rentFacilitated: 'Kodi Iliyowezeshwa',
    dailyRepaymentRate: 'Kiwango cha Malipo ya Kila Siku',
    
    // User Types
    tenant: 'Mpangaji',
    tenantDesc: 'Pata kodi unapohitaji zaidi. Lipa kwa awamu za kila siku.',
    agent: 'Wakala',
    agentDesc: 'Pata kamisheni kwa kuwezesha amana na uondoaji katika jamii yako.',
    supporter: 'Msaidizi',
    supporterDesc: 'Saidia wapangaji kupata kodi na upate faida.',
    landlord: 'Mmiliki',
    landlordDesc: 'Pokea malipo ya kodi kwa wakati, kila wakati.',
    manager: 'Meneja',
    
    // Features
    howItWorks: 'Inavyofanya Kazi',
    step1Title: 'Jisajili',
    step1Desc: 'Fungua akaunti yako kwa dakika chache na nambari yako ya simu.',
    step2Title: 'Omba Kodi',
    step2Desc: 'Tuambie unahitaji kodi kiasi gani na muda wako wa kulipa.',
    step3Title: 'Pokea Fedha',
    step3Desc: 'Pokea fedha moja kwa moja kulipa mmiliki wako ndani ya saa 24.',
    step4Title: 'Lipa Kila Siku',
    step4Desc: 'Fanya malipo madogo ya kila siku hadi ulipolipa yote.',
    
    // Wallet
    walletBalance: 'Salio la Mkoba',
    deposit: 'Weka',
    withdraw: 'Toa',
    send: 'Tuma',
    request: 'Omba',
    
    // Rent
    rentAmount: 'Kiasi cha Kodi',
    dailyRepayment: 'Malipo ya Kila Siku',
    duration: 'Muda',
    totalRepayment: 'Jumla ya Malipo',
    accessFee: 'Ada ya Kufikia',
    requestRent: 'Omba Kodi',
    
    // Status
    pending: 'Inasubiri',
    approved: 'Imekubaliwa',
    rejected: 'Imekataliwa',
    completed: 'Imekamilika',
    
    // Connection
    offline: 'Huna mtandao',
    slowConnection: 'Mtandao polepole',
    online: 'Umerudi mtandaoni',
    
    // Footer
    footerTagline: 'Kuwezesha Afrika, kodi moja kwa wakati.',
    allRightsReserved: 'Haki zote zimehifadhiwa.',
  },
  
  fr: {
    // Common - French
    appName: 'Welile',
    tagline: "Plateforme de Facilitation de Loyer d'Afrique",
    getStarted: 'Commencer',
    signIn: 'Se Connecter',
    signOut: 'Se Déconnecter',
    loading: 'Chargement...',
    save: 'Enregistrer',
    cancel: 'Annuler',
    submit: 'Soumettre',
    back: 'Retour',
    next: 'Suivant',
    yes: 'Oui',
    no: 'Non',
    
    // Navigation
    home: 'Accueil',
    dashboard: 'Tableau de Bord',
    transactions: 'Transactions',
    settings: 'Paramètres',
    earnings: 'Revenus',
    
    // Hero Section
    heroTitle: "Accédez au Loyer Aujourd'hui",
    heroSubtitle: 'Remboursez Progressivement',
    heroDescription: "Rejoignez des millions d'Africains qui font confiance à Welile pour des solutions de loyer flexibles. Obtenez le loyer dont vous avez besoin maintenant, remboursez en petits montants quotidiens.",
    
    // Stats
    activeUsers: 'Utilisateurs Actifs',
    countriesServed: 'Pays Desservis',
    rentFacilitated: 'Loyer Facilité',
    dailyRepaymentRate: 'Taux de Remboursement Quotidien',
    
    // User Types
    tenant: 'Locataire',
    tenantDesc: 'Accédez au loyer quand vous en avez le plus besoin. Remboursez en versements quotidiens flexibles.',
    agent: 'Agent',
    agentDesc: 'Gagnez des commissions en facilitant les dépôts et retraits dans votre communauté.',
    supporter: 'Supporteur',
    supporterDesc: 'Aidez les locataires à accéder au loyer et gagnez des rendements.',
    landlord: 'Propriétaire',
    landlordDesc: 'Recevez des paiements de loyer garantis à temps, à chaque fois.',
    manager: 'Gestionnaire',
    
    // Features
    howItWorks: 'Comment Ça Marche',
    step1Title: "S'inscrire",
    step1Desc: 'Créez votre compte en quelques minutes avec votre numéro de téléphone.',
    step2Title: 'Demander un Loyer',
    step2Desc: 'Dites-nous combien de loyer vous avez besoin et votre période de remboursement.',
    step3Title: 'Recevoir les Fonds',
    step3Desc: 'Recevez les fonds directement pour payer votre propriétaire sous 24 heures.',
    step4Title: 'Rembourser Quotidiennement',
    step4Desc: 'Effectuez de petits paiements quotidiens jusqu\'au remboursement complet.',
    
    // Wallet
    walletBalance: 'Solde du Portefeuille',
    deposit: 'Déposer',
    withdraw: 'Retirer',
    send: 'Envoyer',
    request: 'Demander',
    
    // Rent
    rentAmount: 'Montant du Loyer',
    dailyRepayment: 'Remboursement Quotidien',
    duration: 'Durée',
    totalRepayment: 'Remboursement Total',
    accessFee: "Frais d'Accès",
    requestRent: 'Demander un Loyer',
    
    // Status
    pending: 'En Attente',
    approved: 'Approuvé',
    rejected: 'Rejeté',
    completed: 'Terminé',
    
    // Connection
    offline: 'Vous êtes hors ligne',
    slowConnection: 'Connexion lente détectée',
    online: 'De retour en ligne',
    
    // Footer
    footerTagline: "Autonomiser l'Afrique, un loyer à la fois.",
    allRightsReserved: 'Tous droits réservés.',
  },
  
  am: {
    // Common - Amharic
    appName: 'ወሊለ',
    tagline: 'የአፍሪካ የቤት ኪራይ አገልግሎት መድረክ',
    getStarted: 'ጀምር',
    signIn: 'ግባ',
    signOut: 'ውጣ',
    loading: 'በመጫን ላይ...',
    save: 'አስቀምጥ',
    cancel: 'ሰርዝ',
    submit: 'አስገባ',
    back: 'ተመለስ',
    next: 'ቀጥል',
    yes: 'አዎ',
    no: 'አይ',
    
    // Navigation
    home: 'መነሻ',
    dashboard: 'ዳሽቦርድ',
    transactions: 'ግብይቶች',
    settings: 'ቅንብሮች',
    earnings: 'ገቢዎች',
    
    // Hero Section
    heroTitle: 'ዛሬ ኪራይ ያግኙ',
    heroSubtitle: 'ቀስ በቀስ ይክፈሉ',
    heroDescription: 'ከሚሊዮኖች አፍሪካውያን ጋር ይቀላቀሉ። አሁን የሚያስፈልግዎትን ኪራይ ያግኙ፣ በየቀኑ በትንሽ መጠን ይክፈሉ።',
    
    // Stats
    activeUsers: 'ንቁ ተጠቃሚዎች',
    countriesServed: 'አገልግሎት የሚሰጡ አገራት',
    rentFacilitated: 'የተመቻቸ ኪራይ',
    dailyRepaymentRate: 'የየቀኑ ክፍያ መጠን',
    
    // User Types
    tenant: 'ተከራይ',
    tenantDesc: 'በጣም በሚያስፈልግዎ ጊዜ ኪራይ ያግኙ። በየቀኑ በተለዋዋጭ ክፍያዎች ይክፈሉ።',
    agent: 'ወኪል',
    agentDesc: 'በማህበረሰብዎ ውስጥ ተቀማጭ ገንዘብ እና መውጣትን በማመቻቸት ኮሚሽን ያግኙ።',
    supporter: 'ደጋፊ',
    supporterDesc: 'ተከራዮች ኪራይ እንዲያገኙ ይርዱ እና ትርፍ ያግኙ።',
    landlord: 'ባለቤት',
    landlordDesc: 'የተረጋገጠ የኪራይ ክፍያ በሰዓቱ ይቀበሉ።',
    manager: 'ሥራ አስኪያጅ',
    
    // Features
    howItWorks: 'እንዴት እንደሚሰራ',
    step1Title: 'ይመዝገቡ',
    step1Desc: 'በስልክ ቁጥርዎ ብቻ በደቂቃዎች ውስጥ መለያዎን ይፍጠሩ።',
    step2Title: 'ኪራይ ይጠይቁ',
    step2Desc: 'ምን ያህል ኪራይ እንደሚያስፈልግዎ እና የክፍያ ጊዜዎን ይንገሩን።',
    step3Title: 'ገንዘብ ይቀበሉ',
    step3Desc: 'በ24 ሰዓታት ውስጥ ለባለቤትዎ ለመክፈል ገንዘብ በቀጥታ ይቀበሉ።',
    step4Title: 'በየቀኑ ይክፈሉ',
    step4Desc: 'ሙሉ በሙሉ እስኪከፍሉ ድረስ ትንሽ የየቀን ክፍያዎችን ያድርጉ።',
    
    // Wallet
    walletBalance: 'የዋሌት ቀሪ ሂሳብ',
    deposit: 'ያስቀምጡ',
    withdraw: 'ያውጡ',
    send: 'ላክ',
    request: 'ጠይቅ',
    
    // Rent
    rentAmount: 'የኪራይ መጠን',
    dailyRepayment: 'የየቀን ክፍያ',
    duration: 'ጊዜ',
    totalRepayment: 'ጠቅላላ ክፍያ',
    accessFee: 'የመዳረሻ ክፍያ',
    requestRent: 'ኪራይ ይጠይቁ',
    
    // Status
    pending: 'በመጠባበቅ ላይ',
    approved: 'ተቀባይነት አግኝቷል',
    rejected: 'ውድቅ ተደርጓል',
    completed: 'ተጠናቋል',
    
    // Connection
    offline: 'ከመስመር ውጭ ነዎት',
    slowConnection: 'ቀርፋፋ ግንኙነት ተገኝቷል',
    online: 'ወደ መስመር ተመልሰዋል',
    
    // Footer
    footerTagline: 'አፍሪካን በአንድ ኪራይ ማብቃት።',
    allRightsReserved: 'መብቶች በሙሉ የተጠበቁ ናቸው።',
  },
};

export const languageNames: Record<Language, string> = {
  en: 'English',
  sw: 'Kiswahili',
  fr: 'Français',
  am: 'አማርኛ',
};

export const languageFlags: Record<Language, string> = {
  en: '🇬🇧',
  sw: '🇰🇪',
  fr: '🇫🇷',
  am: '🇪🇹',
};
