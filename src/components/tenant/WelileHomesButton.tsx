import { useNavigate } from 'react-router-dom';
import { Home, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';

export function WelileHomesButton() {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <Card 
        className="cursor-pointer hover:shadow-md transition-all duration-200 border-purple-200 bg-gradient-to-r from-purple-50 to-background overflow-hidden group"
        onClick={() => navigate('/welile-homes')}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
              <Home className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground">🏠 Welile Homes</h3>
                <Badge variant="secondary" className="bg-purple-100 text-purple-700 text-[10px]">
                  NEW
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Turn your rent into your future home
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-purple-600 transition-colors" />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
