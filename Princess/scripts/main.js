

var myImage = document.querySelector('img');
myImage.onclick = function(){
    var mySrc = myImage.getAttribute('src');
    if(mySrc === 'Princess/images/Princess.png'){
        myImage.setAttribute ('src','Princess/images/heihei.jpg');
    } else {
        myImage.setAttribute ('src','Princess/images/Princess.png');

    }
}
var myButton = document.querySelector('button');
var myHeading = document.querySelector('h1');

function setUserName() {
  var myName = prompt('Please enter y name.');
  localStorage.setItem('name', myName);
  myHeading.innerHTML = 'My little princess, ' + myName;
}

if(!localStorage.getItem('name')) {
  setUserName();
} else {
  var storedName = localStorage.getItem('name');
  myHeading.innerHTML = 'My little princess, ' + storedName;
}

myButton.onclick = function() {
  setUserName();
}