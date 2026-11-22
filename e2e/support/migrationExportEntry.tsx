import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppContext } from '../../src/context/AppContext';
import { TransferSection } from '../../src/components/Settings/vault/TransferSection';
import '../../src/index.css';

export { storage } from '../../src/lib/storage';
export { syncEngine } from '../../src/lib/sync/syncEngine';
export { saveCursor, saveOutbox, saveTombstones } from '../../src/lib/sync/localBookkeeping';
export { backupService } from '../../src/lib/backupService';

export function renderTransfer() {
  function Fixture() {
    const [toast, setToast] = React.useState('');
    const app = { addToast: setToast } as unknown as NonNullable<React.ContextType<typeof AppContext>>;
    return <AppContext.Provider value={app}><TransferSection /><output>{toast}</output></AppContext.Provider>;
  }
  createRoot(document.getElementById('root')!).render(<Fixture />);
}
