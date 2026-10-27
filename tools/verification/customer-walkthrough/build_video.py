from PIL import Image, ImageDraw, ImageFont, ImageOps
from pathlib import Path
import subprocess, json, re, concurrent.futures, sys
sys.path.insert(0,'/tmp/sayand-video-deps')
import imageio_ffmpeg
ROOT=Path(__file__).parent; OUT=ROOT/'render';OUT.mkdir(exist_ok=True)
FF=imageio_ffmpeg.get_ffmpeg_exe()
SCENES=[
('Welcome to SAYAND','01-home.png','Your customer guide',['Browse the collections','Choose your piece','Shop with confidence'],"Welcome to Sayand. In this short guide, we will explore the store, choose a product, understand preorders, and show you where to find checkout, order updates and shopping help."),
('Find your collection','02-collection.png','Start with the menu',['WOMEN · MEN · ACCESSORIES','Open a product to explore it','SAYAND returns you home'],"Start at the top menu. Choose Women, Men or Accessories to explore a collection. Click a product to open its page. Select the Sayand logo whenever you want to return to the homepage."),
('Explore the product','03-product.png','Look closely',['Browse the photographs','Use thumbnails or swipe','Zoom in for a closer look'],"On a product page, browse the photographs using the thumbnails or swipe through the gallery. Use the zoom control for a closer look at the fabric, colours and finishing details."),
('Check the fit','04-measurements.png','Before you add to bag',['Read DESCRIPTION and DETAILS','Check MEASUREMENTS','Compare with your own fit'],"Read Description and Details, then open Measurements. Compare the listed measurements with your own or a garment that fits well. Check the available sizes and stock information before choosing your piece."),
('Choose your options','05-gallery.png','Size, colour and quantity',['Select an available size','Check colour and quantity','Choose ADD TO BAG'],"Choose an available size, check the colour, and set the quantity with the plus and minus controls. Then choose Add to Bag. If prompted, sign in to continue shopping with your account."),
('Find preorder drops','06-preorder-section.png','A separate collection section',['Look for PREORDER DROPS','A future release','Check the dispatch estimate'],"Preorder Drops have their own section inside the relevant collection. These are future releases, so always check the estimated dispatch date. A preorder is not the same as an item ready for immediate shipment."),
('Understand preorder pricing','07-preorder.png','Pay now, receive later',['Compare launch and preorder prices','Pay the full preorder price now','Dispatch is not delivery'],"The preorder page shows the intended launch price, the price you pay now, and the saving. You pay in full at checkout. The displayed dispatch date is an estimate for shipping, not a guaranteed delivery date."),
('Sign in to your account','09-login.png','Keep your shopping together',['Use your email and password','Or choose a supported sign-in','New customer? Sign up'],"Use the account icon to sign in. Enter your email and password, or choose an available social sign-in option. New customers can select Sign up here. Forgot password helps you recover access."),
('Review your shopping bag','08-bag.png','One final check',['Open BAG in the header','Review items, sizes and quantities','PROCEED TO CHECKOUT'],"Open Bag in the header after signing in. Review your items, sizes and quantities, and remove anything you no longer want. Check the total, then select Proceed to Checkout when you are ready."),
('Complete checkout',None,'Checkout checklist',['1  Contact and delivery details','2  Review shipping and total','3  Continue to secure payment'],"At checkout, enter your contact information and delivery address. Apply a valid promo code if you have one. Review shipping and the final total, then choose Complete Order to continue to secure payment."),
('Follow your order','12-orders-help.png','My Account → Orders',['Sign in to see order status','Preorder items show PREORDERED','Shipping updates include tracking'],"After purchase, sign in to My Account to view your orders. Preorder items are labelled Preordered. When your order is shipped, its status updates and a shipping email is triggered with tracking information."),
('Ask ELIA for help','10-elia.png','Your shopping assistant',['Click ASK ELIA → START CHATTING','Ask about products or preorders','Open the VIEW PRODUCT card'],"For shopping help, click Ask Elia, then Start chatting. Ask about products, sizes or preorders. Product answers can include a picture, details and a View product link. Use My Orders for private order information."),
('Discover the editorial','11-editorial.png','Explore the styling',['Open the editorial from home','Browse the looks and stories','Follow links to featured pieces'],"For inspiration, explore the editorial from the homepage. Browse the looks and stories, then follow product or collection links to discover the pieces behind the styling."),
('Know where to get support','12-orders-help.png','Help is easy to find',['FAQ answers common questions','Check shipping and returns','Contact support for order help'],"The footer contains Frequently Asked Questions, shipping information, returns and order tracking. Check these pages for current policies, or contact Sayand support when you need help with your own order."),
('You are ready to explore','01-home.png','thesayand.com',['Browse · Choose · Review','Check preorder dates carefully','Enjoy discovering SAYAND'],"You are ready to explore Sayand. Browse the collections, check your fit and any preorder dates, then review your bag before paying. Visit the Sayand website to begin.")]
FONT='/System/Library/Fonts/Supplemental/Arial.ttf';BOLD='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
def font(n,b=False):return ImageFont.truetype(BOLD if b else FONT,n)
def wrap(s,f,w,d):
 lines=[];line=''
 for word in s.split():
  test=(line+' '+word).strip()
  if d.textlength(test,font=f)>w and line:lines.append(line);line=word
  else:line=test
 return lines+[line]
def block(d,xy,s,f,color,w,spacing=10):
 x,y=xy
 for line in wrap(s,f,w,d):d.text((x,y),line,font=f,fill=color);y+=f.size+spacing
 return y
GREEN='#122b20';GOLD='#d4b45f';CREAM='#f7f3e9'
for i,(title,shot,kicker,bullets,speech) in enumerate(SCENES):
 image=Image.new('RGB',(1920,1080),GREEN);d=ImageDraw.Draw(image)
 d.text((42,28),'S A Y A N D',font=font(28,True),fill=GOLD)
 d.text((42,70),title,font=font(42,True),fill=CREAM)
 d.text((1710,48),f'{i+1:02} / {len(SCENES):02}',font=font(28),fill=GOLD)
 if shot:
  src=Image.open(ROOT/'captures'/shot).convert('RGB');src=ImageOps.contain(src,(1280,720))
  image.paste(src,(40+(1280-src.width)//2,150+(720-src.height)//2))
  d.rounded_rectangle((1350,150,1880,870),radius=20,fill=CREAM)
  y=block(d,(1384,186),kicker,font(36,True),GREEN,450,12)+36
  for j,b in enumerate(bullets):
   d.ellipse((1384,y+4,1416,y+36),fill=GREEN);d.text((1393,y+6),str(j+1),font=font(20,True),fill=CREAM)
   y=block(d,(1434,y),b,font(29),GREEN,405,10)+40
 else:
  for j,b in enumerate(bullets):
   x=55+j*625;d.rounded_rectangle((x,240,x+590,720),radius=24,fill=CREAM)
   d.ellipse((x+235,285,x+355,405),fill=GREEN);d.text((x+275,315),str(j+1),font=font(48,True),fill=GOLD)
   block(d,(x+45,450),b[3:],font(40,True),GREEN,500,14)
  d.text((60,790),'Only confirm payment when your order details are correct.',font=font(32),fill=GOLD)
 d.line((40,905,1880,905),fill=GOLD,width=2)
 block(d,(60,934),speech,font(30),CREAM,1790,10)
 d.rectangle((0,1072,int(1920*(i+1)/len(SCENES)),1079),fill=GOLD)
 image.save(OUT/f'{i:02}.png')
 (OUT/f'{i:02}.txt').write_text(speech)
 (ROOT/'narration.txt').write_text('\n\n'.join(f'{j+1}. {s[0]}\n{s[4]}' for j,s in enumerate(SCENES)))
def voice(i):
 subprocess.run(['say','-v','Samantha','-r','158','-f',str(OUT/f'{i:02}.txt'),'-o',str(OUT/f'{i:02}.aiff')],check=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(voice,range(len(SCENES))))
durations=[]
for i in range(len(SCENES)):
 p=subprocess.run([FF,'-i',str(OUT/f'{i:02}.aiff')],capture_output=True,text=True)
 m=re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)',p.stderr);h,mi,se=map(float,m.groups());durations.append(max(8,h*3600+mi*60+se+0.8))
print('Total duration',sum(durations),flush=True)
(ROOT/'timing.json').write_text(json.dumps(durations))
def render(i):
 t=durations[i]
 cmd=[FF,'-hide_banner','-loglevel','error','-y','-loop','1','-framerate','24','-i',str(OUT/f'{i:02}.png'),'-i',str(OUT/f'{i:02}.aiff'),'-vf',f'fade=t=in:st=0:d=0.3,fade=t=out:st={t-0.3}:d=0.3','-af','apad','-t',str(t),'-c:v','libx264','-preset','ultrafast','-crf','21','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-threads','2',str(OUT/f'{i:02}.mp4')]
 subprocess.run(cmd,check=True);print('Rendered',i+1,flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(render,range(len(SCENES))))
(OUT/'concat.txt').write_text('\n'.join(f"file '{i:02}.mp4'" for i in range(len(SCENES))))
subprocess.run([FF,'-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(OUT/'concat.txt'),'-c','copy','-movflags','+faststart',str(ROOT/'SAYAND-customer-walkthrough.mp4')],check=True)
# Standalone subtitles for sharing platforms.
def stamp(t):
 ms=round(t*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
time=0;lines=[]
for i,s in enumerate(SCENES):lines.append(f'{i+1}\n{stamp(time)} --> {stamp(time+durations[i])}\n{s[4]}\n');time+=durations[i]
(ROOT/'SAYAND-customer-walkthrough.srt').write_text('\n'.join(lines))
print('DONE',ROOT/'SAYAND-customer-walkthrough.mp4',flush=True)
