// Copyright (c) 2026 GarudaChain developers
// Create Token (Saham) page — Creator wallet mode
#ifndef BITCOIN_QT_CREATETOKENPAGE_H
#define BITCOIN_QT_CREATETOKENPAGE_H

#include <QWidget>

class ClientModel;
class WalletModel;
class PlatformStyle;

QT_BEGIN_NAMESPACE
class QComboBox;
class QDoubleSpinBox;
class QLabel;
class QLineEdit;
class QNetworkAccessManager;
class QNetworkReply;
class QPushButton;
class QSlider;
class QSpinBox;
class QStackedWidget;
class QTabWidget;
class QTextBrowser;
class QTextEdit;
QT_END_NAMESPACE

class CreateTokenPage : public QWidget
{
    Q_OBJECT

public:
    explicit CreateTokenPage(const PlatformStyle *platformStyle, QWidget *parent = nullptr);
    void setClientModel(ClientModel *clientModel);
    void setWalletModel(WalletModel *walletModel);

private Q_SLOTS:
    void onNext();
    void onPrev();
    void onDeploy();
    void onLoadAddresses();
    void onCalcChanged();
    void onPreviewDividend();
    void onPayDividend();
    void onRefreshIPO();
    void onRefreshTokens();
    void onUploadLogo();
    void onUploadProspektus();
    void onUploadLegalitas();

private:
    ClientModel         *clientModel{nullptr};
    WalletModel         *walletModel{nullptr};
    const PlatformStyle *platformStyle;
    int                  step{1};

    QTabWidget          *tabs;
    QStackedWidget      *stack;
    QLabel              *stepBar;
    QPushButton         *prevBtn;
    QPushButton         *nextBtn;
    QPushButton         *deployBtn;

    // ── Step 1: Info Token & Perusahaan ──────────────────────────────────
    QLineEdit  *fSymbol;       // Simbol saham  e.g. WBSA
    QLineEdit  *fTokenName;    // Nama token    e.g. Saham BSA Logistics
    QLineEdit  *fCompany;      // Nama perusahaan  e.g. PT BSA Logistics Indonesia Tbk
    QComboBox  *fType;         // Konvensional / Syariah
    QComboBox  *fSector;       // Sektor
    QLineEdit  *fSubsector;    // Subsektor
    QLineEdit  *fBusiness;     // Bidang usaha
    QLineEdit  *fCorpAddress;  // Alamat perusahaan
    QLineEdit  *fWebsite;
    QLineEdit  *fSocialX;      // Twitter/X
    QLineEdit  *fSocialIG;     // Instagram
    QLineEdit  *fSocialYT;     // YouTube
    QLineEdit  *fSocialFB;     // Facebook
    QLineEdit  *fSocialLI;     // LinkedIn
    QLineEdit  *fSocialTT;     // TikTok
    QTextEdit  *fDesc;         // Deskripsi perusahaan
    // ── Upload Gambar & Dokumen ───────────────────────────────────────────
    QLabel      *fLogoPreview;   // Preview logo perusahaan
    QPushButton *fLogoUploadBtn; // Pilih file gambar
    QLineEdit   *fLogoCid;       // IPFS CID hasil upload logo
    QPushButton *fProspektusUploadBtn;
    QLineEdit   *fProspektusCid; // IPFS CID prospektus
    QPushButton *fLegalitasUploadBtn;
    QLineEdit   *fLegalitasCid;  // IPFS CID legalitas

    // ── Step 2: Supply & Harga ────────────────────────────────────────────
    QLineEdit       *fSupply;       // Total supply lembar
    QLineEdit       *fPrice;        // Harga per token (GRD)
    QLabel          *fSupplyInfo;   // Info kalkulasi

    // ── Step 3: Presale (e-IPO) ───────────────────────────────────────────
    QSlider         *fAllocSlider;  // % alokasi presale (10–80)
    QLabel          *fAllocLabel;   // "30% (300.000 token)"
    QComboBox       *fDuration;     // 3 / 7 / 14 / 30 hari
    QLabel          *fPresaleCalc;  // Estimasi dana & biaya
    QComboBox       *fIssuerAddr;   // Alamat penerbit (dari wallet)
    QPushButton     *fLoadAddr;

    // ── Step 4: Review ────────────────────────────────────────────────────
    QTextBrowser    *fReview;

    // ── Tab Dividen ───────────────────────────────────────────────────────
    QComboBox    *divToken;
    QLineEdit    *divAmount;
    QPushButton  *divPreviewBtn;
    QPushButton  *divPayBtn;
    QTextBrowser *divResult;

    // ── Tab e-IPO Aktif ───────────────────────────────────────────────────
    QTextBrowser *ipoBrowser;
    QPushButton  *ipoRefreshBtn;

    // ── Tab Token Saya ────────────────────────────────────────────────────
    QTextBrowser *tokenBrowser;
    QPushButton  *tokenRefreshBtn;

    QNetworkAccessManager *m_nam{nullptr};

    void buildUI();
    void refreshStepBar();
    void refreshCalc();
    void buildReview();
    void loadAddresses();
    void uploadToIpfs(const QString &filePath, QLineEdit *cidTarget,
                      QLabel *statusLabel = nullptr,
                      QPushButton *resetBtn = nullptr, const QString &resetText = {});
};

#endif // BITCOIN_QT_CREATETOKENPAGE_H
