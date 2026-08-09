/**
 * Simple Hindi gloss dictionary for shop-floor screens (FR-14.04). Not a full
 * i18n framework — English stays primary everywhere; Hindi is shown as a
 * secondary line on the screens Store/Production staff actually touch by
 * hand (material receipt, wastage, job stage status), using the same terms
 * the BRD glossary itself uses (e.g. "Wastage (Chhij / Ghat)").
 */
export const hi = {
  jobStageStatus: {
    PENDING: "लंबित",
    ISSUED: "जारी किया गया",
    IN_PROGRESS: "काम जारी",
    RECEIVED: "प्राप्त हुआ",
    APPROVED: "स्वीकृत",
    REWORK: "दोबारा काम",
  } as Record<string, string>,
  productStatus: {
    DESIGN: "डिज़ाइन",
    ESTIMATED: "अनुमानित",
    IN_PRODUCTION: "निर्माणाधीन",
    FINISHED: "तैयार",
    SOLD: "बिका हुआ",
    MELTED: "पिघलाया गया",
  } as Record<string, string>,
  receipt: {
    title: "माल वापसी दर्ज करें",
    fineGoldIssued: "जारी किया गया सोना",
    finishedPieceWeight: "तैयार माल का वज़न",
    fillerWeight: "मोम/अन्य मिलावट का वज़न",
    dustRecovered: "सोने की धूल",
    unusedReturned: "बिना इस्तेमाल सोना वापस",
    netWastage: "कुल घाटा (छीज)",
    tolerance: "सीमा",
    withinTolerance: "सीमा के भीतर",
    exceedsTolerance: "सीमा से अधिक — मैनेजर की मंज़ूरी ज़रूरी",
    submit: "जमा करें",
    reasonRequired: "अधिक घाटे का कारण (ज़रूरी)",
    approve: "मंज़ूरी दें",
    reject: "अस्वीकार करें",
  },
  issue: {
    purity: "शुद्धता",
    grossWeight: "कुल वज़न",
    issue: "जारी करें",
  },
  labour: {
    title: "मज़दूरी",
    add: "जोड़ें",
    approve: "मंज़ूरी दें",
  },
};
