-- Update global SharePoint site URL in app_settings
UPDATE public.app_settings 
SET sharepoint_site_url = 'https://vivacityrtocoaching.sharepoint.com/sites/vivacityteam/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2Fvivacityteam%2FShared%20Documents%2FClient%20Folder&viewid=a0aa69f7%2D186e%2D4660%2Da865%2D83d73383861c&view=0'
WHERE id = 1;