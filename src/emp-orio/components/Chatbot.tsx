import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react-v462';
import { Button } from '@/emp-orio/components/ui/button';
import { useFeatureFlags } from '@/emp-orio/hooks/useFeatureFlags';
const Chatbot = () => {
 const { data: flags } = useFeatureFlags();
 if (flags && !flags.chatbot_enabled) return null;
 return <Button asChild size="icon" className="fixed bottom-24 right-4 z-40 rounded-full" title="Atendimento PapeLemi"><Link to="/suporte" aria-label="Abrir suporte"><MessageCircle/></Link></Button>;
};
export default Chatbot;
