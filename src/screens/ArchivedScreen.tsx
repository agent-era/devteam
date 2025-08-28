import React, {useState, useEffect} from 'react';
import ArchivedView from '../components/views/ArchivedView.js';
import FullScreen from '../components/common/FullScreen.js';
import {useWorktreeContext} from '../contexts/WorktreeContext.js';

const h = React.createElement;

interface ArchivedScreenProps {
  onBack: () => void;
}

export default function ArchivedScreen({onBack}: ArchivedScreenProps) {
  const {discoverProjects, getArchivedForProject, deleteArchived} = useWorktreeContext();
  const [archivedItems, setArchivedItems] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const loadArchivedItems = () => {
    const projects = discoverProjects();
    const items: any[] = [];
    for (const project of projects) {
      items.push(...getArchivedForProject(project));
    }
    setArchivedItems(items);
    setSelectedIndex(prevIndex => Math.min(Math.max(0, items.length - 1), prevIndex));
  };

  useEffect(() => {
    loadArchivedItems();
  }, []);

  const handleMove = (delta: number) => {
    setSelectedIndex(currentIndex => 
      Math.max(0, Math.min(archivedItems.length - 1, currentIndex + delta))
    );
  };

  const handleDelete = async (index: number) => {
    const item = archivedItems[index];
    if (!item) return;
    
    try {
      const success = await deleteArchived(item.path);
      if (success) {
        loadArchivedItems();
      }
    } catch (error) {
      console.error('Failed to delete archived item:', error);
    }
  };

  return h(FullScreen, null,
    h(ArchivedView, {
      items: archivedItems as any,
      selectedIndex,
      onMove: handleMove,
      onDelete: handleDelete,
      onBack
    })
  );
}