import { ArrowLeft, Percent, Users, Award, BookOpen, Download, ImageIcon, Share2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import WelileLogo from '@/assets/welile-logo.jpeg';
import WelileServiceCentrePoster from '@/assets/welile-service-centre-poster.jpeg';
import { toast } from 'sonner';

const AgentCommissionBenefits = () => {
  const navigate = useNavigate();

  const handleShareWhatsApp = () => {
    const shareText = `💰 *Welile Agent Commission Benefits*

📊 *Repayment Commission — 10%*
Every tenant repayment earns agents 10%, split by role:
• Source Agent (onboarded tenant): *2%*
• Tenant Manager (assigned agent): *8%*

👥 *Recruiter Override*
If the Manager was recruited by another agent:
• Source Agent: 2%
• Tenant Manager: 6%
• Recruiter Override: 2%
Total always = 10%

🏆 *Event-Based Bonuses*
• Rent request posted: *UGX 5,000*
• Empty house listed: *UGX 5,000*
• Tenant replacement: *UGX 20,000*
• Sub-agent registration: *UGX 10,000*

📒 All commissions tracked transparently in the ledger.

👉 Join Welile as an Agent: https://welilereceipts.com/join`;

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

    // Try native share first on mobile
    if (navigator.share) {
      navigator.share({
        title: 'Welile Agent Commission Benefits',
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
          <h1 className="text-base font-bold text-white flex-1">Agent Commission Benefits</h1>
          <Button variant="ghost" size="icon" onClick={handleShareWhatsApp} className="text-white hover:bg-white/10 rounded-xl h-10 w-10">
            <Share2 className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="p-4 space-y-4 max-w-2xl mx-auto pb-8">
        {/* Service Centre Materials */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <ImageIcon className="h-4 w-4 text-primary" />
              </div>
              Service Centre Materials
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-muted-foreground">Download and print these materials to set up a Welile Service Centre anywhere.</p>

            {/* Welile Logo */}
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

            {/* Welile Service Centre Poster */}
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

        {/* Repayment Commission */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Percent className="h-4 w-4 text-primary" />
              </div>
              Repayment Commission — 10%
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Each tenant repayment triggers a commission of <span className="font-semibold text-foreground">exactly 10%</span> of the repayment amount. This is split among agents based on their role.</p>

            <div className="rounded-xl border border-border/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-3 py-2 font-semibold text-foreground">Role</th>
                    <th className="text-right px-3 py-2 font-semibold text-foreground">Share</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border/40">
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-foreground">Source Agent</span>
                      <br />
                      <span className="text-xs">The agent who onboarded the tenant</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-primary">2%</td>
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-foreground">Tenant Manager</span>
                      <br />
                      <span className="text-xs">The currently assigned agent</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-primary">8%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Recruiter Override */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="p-1.5 rounded-lg bg-accent/50">
                <Users className="h-4 w-4 text-primary" />
              </div>
              Recruiter Override
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>If the Tenant Manager was recruited by another agent, the <span className="font-semibold text-foreground">recruiter receives 2%</span> of the total repayment, and the Manager keeps the remaining <span className="font-semibold text-foreground">6%</span>.</p>

            <div className="bg-muted/40 rounded-xl p-3 space-y-1.5">
              <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Example — UGX 100,000 repayment</p>
              <div className="flex justify-between"><span>Source Agent (2%)</span><span className="font-medium text-foreground">UGX 2,000</span></div>
              <div className="flex justify-between"><span>Tenant Manager (6%)</span><span className="font-medium text-foreground">UGX 6,000</span></div>
              <div className="flex justify-between"><span>Recruiter Override (2%)</span><span className="font-medium text-foreground">UGX 2,000</span></div>
              <div className="flex justify-between border-t border-border/40 pt-1.5 font-semibold text-foreground"><span>Total</span><span>UGX 10,000 (10%)</span></div>
            </div>
          </CardContent>
        </Card>

        {/* Edge Cases */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="p-1.5 rounded-lg bg-muted">
                <BookOpen className="h-4 w-4 text-primary" />
              </div>
              Important Rules
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <span className="text-primary font-bold">•</span>
                <span>Only <span className="font-medium text-foreground">one Source Agent</span> and <span className="font-medium text-foreground">one Manager</span> per tenant.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold">•</span>
                <span>If Source and Manager are the <span className="font-medium text-foreground">same person</span>, they receive the full <span className="font-semibold text-foreground">10%</span>.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold">•</span>
                <span>If there is <span className="font-medium text-foreground">no recruiter</span>, the Manager keeps the full <span className="font-semibold text-foreground">8%</span>.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold">•</span>
                <span>Commission must <span className="font-medium text-foreground">always total exactly 10%</span> — never exceed this.</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Event-Based Bonuses */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Award className="h-4 w-4 text-primary" />
              </div>
              Event-Based Bonuses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-3 py-2 font-semibold text-foreground">Event</th>
                    <th className="text-right px-3 py-2 font-semibold text-foreground">Bonus</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border/40">
                    <td className="px-3 py-2.5 text-muted-foreground">Rent request posted</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-foreground">UGX 5,000</td>
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="px-3 py-2.5 text-muted-foreground">Empty house listed</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-foreground">UGX 5,000</td>
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="px-3 py-2.5 text-muted-foreground">Tenant replacement</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-foreground">UGX 20,000</td>
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="px-3 py-2.5 text-muted-foreground">Sub-agent registration</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-foreground">UGX 10,000</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Ledger Tracking */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="p-1.5 rounded-lg bg-muted">
                <BookOpen className="h-4 w-4 text-primary" />
              </div>
              Ledger Tracking
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>All commissions are logged in a ledger for full transparency, recording:</p>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li>Agent ID &amp; Tenant ID</li>
              <li>Event type (repayment, onboarding, listing, etc.)</li>
              <li>Commission amount &amp; percentage</li>
              <li>Timestamp</li>
            </ul>
          </CardContent>
        </Card>
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
