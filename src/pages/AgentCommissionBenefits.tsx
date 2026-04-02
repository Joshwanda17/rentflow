import { ArrowLeft, Percent, Users, Award, BookOpen, Download, ImageIcon, Share2, DollarSign, Star, Printer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import WelileLogo from '@/assets/welile-logo.jpeg';
import WelileServiceCentrePoster from '@/assets/welile-service-centre-poster.jpeg';
import { toast } from 'sonner';
import { ServiceCentreSubmissionForm } from '@/components/agent/ServiceCentreSubmissionForm';

const AgentCommissionBenefits = () => {
  const navigate = useNavigate();

  const handleShareWhatsApp = () => {
    const shareText = `💰 *How You Earn Money as a Welile Agent*

🏠 *Every Time Your Tenant Pays Rent — You Get 10%*

Example: If a tenant pays back UGX 100,000...
✅ You get UGX 10,000 automatically!

Here's how it works:
• The agent who REGISTERED the tenant gets *2%* (UGX 2,000)
• The agent MANAGING the tenant gets *8%* (UGX 8,000)
• If you registered AND manage the tenant — you keep the full *10%*!

👥 *Bonus for Recruiting Other Agents*
If you brought another agent to Welile, you get *2%* from every tenant THEY manage. It's free money!

🎁 *Extra Cash Bonuses*
• Help a tenant apply for rent → *UGX 5,000*
• List an empty house → *UGX 5,000*
• Replace a tenant in a house → *UGX 20,000*
• Register a new agent under you → *UGX 10,000*

💵 All your earnings go straight to your Welile Wallet.

👉 Join Welile as an Agent: https://welilereceipts.com/join`;

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

    if (navigator.share) {
      navigator.share({
        title: 'How You Earn Money as a Welile Agent',
        text: shareText,
      }).catch(() => {
        window.open(whatsappUrl, '_blank');
      });
    } else {
      window.open(whatsappUrl, '_blank');
    }
    
    toast.success('Sharing commission benefits');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-primary shadow-sm">
        <div className="px-3 py-2.5 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white hover:bg-white/10 rounded-xl h-10 w-10">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-base font-bold text-white flex-1">How You Earn Money 💰</h1>
          <Button variant="ghost" size="icon" onClick={handleShareWhatsApp} className="text-white hover:bg-white/10 rounded-xl h-10 w-10">
            <Share2 className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="p-4 space-y-4 max-w-2xl mx-auto pb-8">

        {/* Quick Summary */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4 pb-4">
            <div className="text-center space-y-2">
              <div className="text-3xl">💵</div>
              <p className="text-base font-bold text-foreground">Every time your tenant pays rent, you earn money!</p>
              <p className="text-sm text-muted-foreground">You get <span className="font-bold text-primary text-lg">10%</span> of every repayment — automatically sent to your wallet.</p>
            </div>
          </CardContent>
        </Card>

        {/* How the 10% is shared */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <DollarSign className="h-4 w-4 text-primary" />
              </div>
              How the 10% is Shared
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>When a tenant pays back rent, <span className="font-semibold text-foreground">two agents can earn</span> from that payment:</p>

            <div className="space-y-3">
              <div className="rounded-xl bg-muted/40 p-3">
                <p className="font-semibold text-foreground text-sm">1️⃣ The Agent Who Registered the Tenant</p>
                <p className="text-xs mt-1">This is the person who first brought the tenant to Welile. You get <span className="font-bold text-primary">2%</span> of every repayment — forever!</p>
              </div>
              <div className="rounded-xl bg-muted/40 p-3">
                <p className="font-semibold text-foreground text-sm">2️⃣ The Agent Managing the Tenant Now</p>
                <p className="text-xs mt-1">This is the agent currently assigned to the tenant. You get <span className="font-bold text-primary">8%</span> of every repayment.</p>
              </div>
              <div className="rounded-xl bg-primary/10 border border-primary/20 p-3">
                <p className="font-semibold text-foreground text-sm">⭐ If You Are Both?</p>
                <p className="text-xs mt-1">If you registered the tenant AND you are managing them — you keep the <span className="font-bold text-primary">full 10%</span>! That's the best position to be in.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Real Example */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <BookOpen className="h-4 w-4 text-primary" />
              </div>
              Real Money Example
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">Let's say a tenant pays back <span className="font-bold text-foreground">UGX 100,000</span>. Here's who gets paid:</p>

            <div className="rounded-xl border border-border/60 overflow-hidden">
              <div className="bg-muted/50 px-3 py-2 font-semibold text-foreground text-xs uppercase tracking-wide">
                💰 Who Gets What
              </div>
              <div className="divide-y divide-border/40">
                <div className="flex justify-between px-3 py-2.5">
                  <span className="text-muted-foreground">Agent who registered tenant (2%)</span>
                  <span className="font-bold text-foreground">UGX 2,000</span>
                </div>
                <div className="flex justify-between px-3 py-2.5">
                  <span className="text-muted-foreground">Agent managing tenant (8%)</span>
                  <span className="font-bold text-foreground">UGX 8,000</span>
                </div>
                <div className="flex justify-between px-3 py-2.5 bg-primary/5">
                  <span className="font-semibold text-foreground">Total Earned</span>
                  <span className="font-bold text-primary">UGX 10,000</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground italic">💡 If you're both the registering agent and the manager, you take home the full UGX 10,000!</p>
          </CardContent>
        </Card>

        {/* Recruiter Bonus */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="p-1.5 rounded-lg bg-accent/50">
                <Users className="h-4 w-4 text-primary" />
              </div>
              Earn from Agents You Recruit
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Did you bring another agent to Welile? <span className="font-semibold text-foreground">You earn 2% from every tenant they manage!</span></p>

            <div className="rounded-xl bg-muted/40 p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground">📖 Example:</p>
              <p className="text-xs">You recruited Agent Mary. Mary manages a tenant who pays UGX 100,000.</p>
              <div className="space-y-1 mt-2">
                <div className="flex justify-between text-xs"><span>Agent who registered tenant</span><span className="font-medium text-foreground">UGX 2,000 (2%)</span></div>
                <div className="flex justify-between text-xs"><span>Mary (managing agent)</span><span className="font-medium text-foreground">UGX 6,000 (6%)</span></div>
                <div className="flex justify-between text-xs"><span>You (recruited Mary) 🎉</span><span className="font-medium text-foreground">UGX 2,000 (2%)</span></div>
                <div className="flex justify-between text-xs border-t border-border/40 pt-1.5 font-semibold text-foreground"><span>Total</span><span>UGX 10,000 (10%)</span></div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground italic">💡 The more agents you recruit, the more you earn — without doing extra work!</p>
          </CardContent>
        </Card>

        {/* Extra Bonuses */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Award className="h-4 w-4 text-primary" />
              </div>
              Extra Cash Bonuses 🎁
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-sm text-muted-foreground mb-3">You also earn bonus cash for helping Welile grow:</p>

            <div className="rounded-xl border border-border/60 overflow-hidden">
              <div className="divide-y divide-border/40">
                <div className="flex justify-between items-center px-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Help a tenant apply for rent</p>
                    <p className="text-xs text-muted-foreground">When you help post a rent request</p>
                  </div>
                  <span className="font-bold text-primary whitespace-nowrap">UGX 5,000</span>
                </div>
                <div className="flex justify-between items-center px-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">List an empty house</p>
                    <p className="text-xs text-muted-foreground">Find and list a vacant house for Welile</p>
                  </div>
                  <span className="font-bold text-primary whitespace-nowrap">UGX 5,000</span>
                </div>
                <div className="flex justify-between items-center px-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Replace a tenant</p>
                    <p className="text-xs text-muted-foreground">Find a new tenant for a vacated house</p>
                  </div>
                  <span className="font-bold text-primary whitespace-nowrap">UGX 20,000</span>
                </div>
                <div className="flex justify-between items-center px-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Register a new agent</p>
                    <p className="text-xs text-muted-foreground">Bring someone new to join as a Welile agent</p>
                  </div>
                  <span className="font-bold text-primary whitespace-nowrap">UGX 10,000</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Where does the money go */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="p-1.5 rounded-lg bg-muted">
                <Star className="h-4 w-4 text-primary" />
              </div>
              Where Does My Money Go?
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>All the money you earn goes straight into your <span className="font-semibold text-foreground">Welile Wallet</span>. You can see every earning clearly:</p>
            <ul className="space-y-1.5">
              <li className="flex gap-2">
                <span className="text-primary">✅</span>
                <span>How much you earned</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">✅</span>
                <span>Which tenant the money came from</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">✅</span>
                <span>Why you earned it (registration, managing, bonus, etc.)</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">✅</span>
                <span>You can withdraw anytime to Mobile Money</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Service Centre Materials */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <ImageIcon className="h-4 w-4 text-primary" />
              </div>
              Posters & Branding
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-muted-foreground">Download these images to print and set up your own Welile Service Centre.</p>

            <div className="space-y-3">
              <div className="rounded-xl border border-border/60 overflow-hidden bg-muted/30">
                <img src={WelileLogo} alt="Welile Logo" className="w-full object-contain" />
              </div>
              <p className="text-sm font-semibold text-foreground text-center">Welile Logo</p>
              <Button variant="outline" asChild className="w-full gap-2">
                <a href={WelileLogo} download="WELILE_LOGO.jpeg">
                  <Download className="h-4 w-4" />
                  Download Welile Logo
                </a>
              </Button>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-border/60 overflow-hidden bg-muted/30">
                <img src={WelileServiceCentrePoster} alt="Welile Service Centre Poster" className="w-full object-contain" />
              </div>
              <p className="text-sm font-semibold text-foreground text-center">Welile Service Centre Poster</p>
              <Button variant="outline" asChild className="w-full gap-2">
                <a href={WelileServiceCentrePoster} download="WELILE_SERVICE_CENTRE_POSTER.jpeg">
                  <Download className="h-4 w-4" />
                  Download Service Centre Poster
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Printing Instructions */}
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Printer className="h-4 w-4 text-primary" />
              </div>
              How to Print & Set Up Your Service Centre 🏪
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">Follow these simple steps:</p>

            <div className="space-y-3">
              <div className="rounded-xl bg-muted/40 p-3">
                <p className="font-semibold text-foreground">Step 1: Download the Images ⬇️</p>
                <p className="text-xs mt-1">Tap the download buttons above to save the <span className="font-medium text-foreground">Welile Logo</span> and the <span className="font-medium text-foreground">Service Centre Poster</span> to your phone.</p>
              </div>

              <div className="rounded-xl bg-muted/40 p-3">
                <p className="font-semibold text-foreground">Step 2: Go to Any Print Shop 🖨️</p>
                <p className="text-xs mt-1">Take your phone to any nearby print shop (cyber café, stationery shop). Show them the downloaded images and ask them to print:</p>
                <ul className="text-xs mt-2 space-y-1 ml-3">
                  <li>• <span className="font-medium text-foreground">Poster:</span> Print on <span className="font-bold">A3</span> or <span className="font-bold">A2</span> paper (big size for walls)</li>
                  <li>• <span className="font-medium text-foreground">Logo:</span> Print on <span className="font-bold">A4</span> paper (normal size for windows/doors)</li>
                  <li>• Ask for <span className="font-medium text-foreground">colour printing</span> on thick/glossy paper</li>
                </ul>
              </div>

              <div className="rounded-xl bg-muted/40 p-3">
                <p className="font-semibold text-foreground">Step 3: Official Colour Codes 🎨</p>
                <p className="text-xs mt-1">Tell the print shop to use these exact colours:</p>
                <div className="flex gap-3 mt-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md border" style={{ backgroundColor: '#7214c9' }} />
                    <div>
                      <p className="text-xs font-bold text-foreground">Purple</p>
                      <p className="text-[10px] font-mono">#7214c9</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md border bg-white" />
                    <div>
                      <p className="text-xs font-bold text-foreground">White</p>
                      <p className="text-[10px] font-mono">#FFFFFF</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md border bg-black" />
                    <div>
                      <p className="text-xs font-bold text-foreground">Black</p>
                      <p className="text-[10px] font-mono">#000000</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-muted/40 p-3">
                <p className="font-semibold text-foreground">Step 4: Mount at Your Location 📌</p>
                <p className="text-xs mt-1">Put up the poster and logo where people can easily see them:</p>
                <ul className="text-xs mt-2 space-y-1 ml-3">
                  <li>• On a <span className="font-medium text-foreground">visible wall</span> facing the road or walkway</li>
                  <li>• On a <span className="font-medium text-foreground">window or glass door</span></li>
                  <li>• On a <span className="font-medium text-foreground">signboard</span> at the entrance</li>
                  <li>• Make sure it's <span className="font-medium text-foreground">not blocked</span> by anything</li>
                </ul>
              </div>

              <div className="rounded-xl bg-primary/10 border border-primary/20 p-3">
                <p className="font-semibold text-foreground">Step 5: Take a Photo & Submit Below 📸</p>
                <p className="text-xs mt-1">After mounting, take a clear photo of your setup and submit it below. Once verified by Agent Ops and approved by the CFO, you will earn <span className="font-bold text-primary">UGX 25,000</span> straight to your wallet!</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Service Centre Submission Form + My Submissions */}
        <ServiceCentreSubmissionForm />

        {/* Share CTA */}
        <Button 
          onClick={handleShareWhatsApp} 
          className="w-full gap-2 bg-[#25D366] hover:bg-[#1da851] text-white font-semibold py-6 rounded-xl text-base"
        >
          <Share2 className="h-5 w-5" />
          Share on WhatsApp
        </Button>
      </div>
    </div>
  );
};

export default AgentCommissionBenefits;
